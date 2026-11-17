import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { ClientSession, Connection, FilterQuery, Model, Types } from 'mongoose';
import { AccountStatus, CLOCK, Clock, Principal } from '../common/domain';
import { BookingFilters } from '../common/dto';
import { AccessPolicy } from '../common/policies';
import { BookingSummary } from '../integrations/contracts';
import { NotificationType } from '../notifications/notifications.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { BookingType, PaymentStatus } from '../payments/payments.constants';
import { Payment } from '../payments/payments.schema';
import { RefundsService } from '../payments/refunds.service';
import { User } from '../users/user.schema';
import {
  BookedRoom,
  CancellationRecord,
  HotelBooking,
  HotelBookingDocument,
  RoomNightLock,
} from './hotel-booking.schema';
import {
  HOLD_DURATION_MS,
  HotelBookingGroup,
  HotelBookingStatus,
  MAX_NIGHTS_PER_BOOKING,
  PAGE_SIZE,
} from './hotel-bookings.constants';
import { CreateHotelBookingDto, HotelBookingListQuery } from './hotel-bookings.dto';
import { HOTEL_INVENTORY, HotelInventoryPort } from './hotel-inventory.port';
import {
  centsToDecimal,
  daysBetween,
  isValidTime,
  isValidTimeZone,
  localDate,
  parseDateOnly,
  roomCoversNights,
  stayNights,
  toCents,
  zonedDateTimeToUtc,
} from './stay-dates';

const REFERENCE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateReference(): string {
  const bytes = randomBytes(8);
  return `HTL-${Array.from(bytes, (b) => REFERENCE_ALPHABET[b % REFERENCE_ALPHABET.length]).join('')}`;
}

function isDuplicateKey(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { code?: number; writeErrors?: { code?: number }[] };
  return e.code === 11000 || (e.writeErrors ?? []).some((w) => w.code === 11000);
}

const GROUP_FILTERS: Record<HotelBookingGroup, HotelBookingStatus[]> = {
  [HotelBookingGroup.UPCOMING]: [HotelBookingStatus.PENDING_PAYMENT, HotelBookingStatus.CONFIRMED],
  [HotelBookingGroup.PAST]: [HotelBookingStatus.COMPLETED],
  [HotelBookingGroup.CANCELLED]: [HotelBookingStatus.CANCELLED, HotelBookingStatus.EXPIRED],
};

/** Normalised statuses used by the admin booking overview (BookingSummary / BookingFilters). */
const SUMMARY_STATUS: Record<HotelBookingStatus, string> = {
  [HotelBookingStatus.PENDING_PAYMENT]: 'PENDING',
  [HotelBookingStatus.CONFIRMED]: 'CONFIRMED',
  [HotelBookingStatus.COMPLETED]: 'COMPLETED',
  [HotelBookingStatus.CANCELLED]: 'CANCELLED',
  [HotelBookingStatus.EXPIRED]: 'CANCELLED',
};

export interface CancellationQuote {
  eligible: boolean;
  reason?: 'BOOKING_NOT_CONFIRMED' | 'CHECK_IN_DATE_REACHED';
  daysBefore?: number;
  refundPercentage?: number;
  refundAmountCents?: number;
}

@Injectable()
export class HotelBookingsService implements OnModuleInit {
  private readonly logger = new Logger(HotelBookingsService.name);

  constructor(
    @InjectModel(HotelBooking.name) private readonly bookings: Model<HotelBooking>,
    @InjectModel(RoomNightLock.name) private readonly locks: Model<RoomNightLock>,
    @InjectModel(Payment.name) private readonly payments: Model<Payment>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectConnection() private readonly db: Connection,
    @Inject(HOTEL_INVENTORY) private readonly inventory: HotelInventoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly policy: AccessPolicy,
    private readonly refunds: RefundsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** The unique (room, night) index must exist before the first concurrent hold. */
  async onModuleInit() {
    await Promise.all([this.bookings.init(), this.locks.init()]);
  }

  // ---------------------------------------------------------------- HTL-16 / HTL-18: hold

  async createHold(actor: Principal, dto: CreateHotelBookingDto) {
    const roomIds = dto.rooms.map((r) => r.roomId);
    if (new Set(roomIds).size !== roomIds.length)
      throw new BadRequestException({
        code: 'DUPLICATE_ROOM',
        message: 'Each room can be selected only once per reservation',
      });
    if (parseDateOnly(dto.checkInDate) === null || parseDateOnly(dto.checkOutDate) === null)
      throw new BadRequestException({ code: 'INVALID_DATE', message: 'Dates must be real dates' });
    const nightCount = daysBetween(dto.checkInDate, dto.checkOutDate);
    if (nightCount < 1)
      throw new BadRequestException({
        code: 'INVALID_STAY_DATES',
        message: 'Check-out date must be after check-in date',
      });
    if (nightCount > MAX_NIGHTS_PER_BOOKING)
      throw new BadRequestException({
        code: 'STAY_TOO_LONG',
        message: `A reservation can cover at most ${MAX_NIGHTS_PER_BOOKING} nights`,
      });
    const nights = stayNights(dto.checkInDate, dto.checkOutDate);
    const now = this.clock.now();

    try {
      const booking = await this.db.transaction(async (session) => {
        const hotel = await this.inventory.getHotel(dto.hotelId, session);
        if (!hotel)
          throw new NotFoundException({ code: 'HOTEL_NOT_FOUND', message: 'Hotel not found' });
        if (!hotel.active)
          throw new ConflictException({
            code: 'HOTEL_NOT_BOOKABLE',
            message: 'This hotel is not accepting reservations',
          });
        if (
          !isValidTimeZone(hotel.timeZone) ||
          !isValidTime(hotel.checkInTime) ||
          !isValidTime(hotel.checkOutTime)
        )
          throw new ConflictException({
            code: 'HOTEL_POLICY_INCOMPLETE',
            message: 'Hotel time zone or check-in/check-out times are not configured',
          });
        if (dto.checkInDate < localDate(now, hotel.timeZone))
          throw new BadRequestException({
            code: 'CHECK_IN_IN_PAST',
            message: 'Check-in date cannot be in the past',
          });

        const rooms = await this.inventory.getRooms(dto.hotelId, roomIds, session);
        const byId = new Map(rooms.map((room) => [room.id, room]));
        const booked: BookedRoom[] = dto.rooms.map((selection) => {
          const room = byId.get(selection.roomId);
          if (!room || room.hotelId !== dto.hotelId)
            throw new NotFoundException({
              code: 'ROOM_NOT_FOUND',
              message: 'A selected room does not belong to this hotel',
            });
          if (selection.adults + selection.childrenAges.length > room.maxOccupancy)
            throw new BadRequestException({
              code: 'OCCUPANCY_EXCEEDED',
              message: `Room ${room.name} allows at most ${room.maxOccupancy} guests`,
            });
          if (!room.active || !roomCoversNights(room, nights))
            throw new ConflictException({
              code: 'ROOM_NOT_AVAILABLE',
              message: `Room ${room.name} is not available for the selected dates`,
            });
          const pricePerNightCents = toCents(room.pricePerNight);
          return {
            roomId: new Types.ObjectId(room.id),
            roomName: room.name,
            roomType: room.type,
            beds: room.beds,
            maxOccupancy: room.maxOccupancy,
            pricePerNightCents,
            subtotalCents: pricePerNightCents * nightCount,
            adults: selection.adults,
            childrenAges: selection.childrenAges,
          };
        });

        const roomObjectIds = booked.map((r) => r.roomId);
        await this.releaseExpiredClaims(roomObjectIds, nights, now, session);

        const [created] = await this.bookings.create(
          [
            {
              userId: new Types.ObjectId(actor.id),
              providerId: new Types.ObjectId(dto.hotelId),
              providerType: 'HOTEL',
              hotelName: hotel.name,
              timeZone: hotel.timeZone,
              checkInDate: dto.checkInDate,
              checkOutDate: dto.checkOutDate,
              checkInAt: zonedDateTimeToUtc(dto.checkInDate, hotel.checkInTime, hotel.timeZone),
              checkOutAt: zonedDateTimeToUtc(dto.checkOutDate, hotel.checkOutTime, hotel.timeZone),
              nights: nightCount,
              rooms: booked,
              totalAmountCents: booked.reduce((sum, r) => sum + r.subtotalCents, 0),
              status: HotelBookingStatus.PENDING_PAYMENT,
              holdExpiresAt: new Date(now.getTime() + HOLD_DURATION_MS),
              policy: {
                checkInTime: hotel.checkInTime,
                checkOutTime: hotel.checkOutTime,
                cancellationTiers: hotel.cancellationTiers.map((t) => ({
                  daysBefore: t.daysBefore,
                  refundPercentage: t.refundPercentage,
                })),
              },
            },
          ],
          { session },
        );

        // All-or-nothing (HTL-18): one claim per room per night. A duplicate on ANY room aborts
        // the whole transaction, so no partial reservation or stray claim survives.
        const claims = roomObjectIds.flatMap((roomId) =>
          nights.map((night) => ({
            roomId,
            night,
            bookingId: created._id,
            expiresAt: created.holdExpiresAt,
          })),
        );
        await this.locks.insertMany(claims, { session, ordered: true });
        return created;
      });
      return this.toView(booking);
    } catch (error) {
      if (isDuplicateKey(error))
        throw new ConflictException({
          code: 'ROOM_ALREADY_RESERVED',
          message: 'One or more selected rooms were just reserved for overlapping dates',
        });
      throw error;
    }
  }

  /** Frees claims of holds whose 10 minutes have passed so the nights can be re-booked. */
  private async releaseExpiredClaims(
    roomIds: Types.ObjectId[],
    nights: string[],
    now: Date,
    session: ClientSession,
  ) {
    const stale = await this.locks
      .find(
        { roomId: { $in: roomIds }, night: { $in: nights }, expiresAt: { $lte: now } },
        { bookingId: 1 },
      )
      .session(session)
      .lean();
    if (!stale.length) return;
    const bookingIds = [...new Set(stale.map((s) => s.bookingId.toString()))].map(
      (id) => new Types.ObjectId(id),
    );
    await this.bookings.updateMany(
      { _id: { $in: bookingIds }, status: HotelBookingStatus.PENDING_PAYMENT },
      { $set: { status: HotelBookingStatus.EXPIRED, expiredAt: now } },
      { session },
    );
    await this.locks.deleteMany(
      { bookingId: { $in: bookingIds }, expiresAt: { $lte: now } },
      { session },
    );
  }

  // ---------------------------------------------------------------- HTL-17: confirmation

  /**
   * Confirms a held reservation only after the backend finds a SUCCEEDED payment for it.
   * Payments mark SUCCEEDED from the signature-verified Stripe webhook (Divan, PAY-01).
   */
  async confirm(actor: Principal, bookingId: string) {
    const booking = await this.bookings.findOne({
      _id: bookingId,
      userId: new Types.ObjectId(actor.id),
    });
    if (!booking) throw this.notFound();
    if (
      booking.status === HotelBookingStatus.CONFIRMED ||
      booking.status === HotelBookingStatus.COMPLETED
    )
      return this.toView(booking);
    if (
      booking.status === HotelBookingStatus.EXPIRED &&
      (await this.findSucceededPayment(booking))
    ) {
      // Paid after the hold was released: the rooms cannot be guaranteed, refund in full.
      await this.refundInFull(booking);
      throw new ConflictException({
        code: 'HOLD_EXPIRED',
        message: 'The 10-minute hold expired before confirmation; the payment is refunded in full',
      });
    }
    if (booking.status !== HotelBookingStatus.PENDING_PAYMENT)
      throw new ConflictException({
        code: 'BOOKING_NOT_PENDING',
        message: `Reservation is ${booking.status} and cannot be confirmed`,
      });
    const payment = await this.findSucceededPayment(booking);
    if (!payment)
      throw new ConflictException({
        code: 'PAYMENT_NOT_VERIFIED',
        message: 'No successful payment has been verified for this reservation',
      });
    return this.toView(await this.confirmPaid(booking, payment));
  }

  private findSucceededPayment(booking: HotelBookingDocument) {
    return this.payments
      .findOne({
        bookingId: booking.id as string,
        bookingType: BookingType.HOTEL,
        userId: booking.userId,
        status: PaymentStatus.SUCCEEDED,
      })
      .sort({ createdAt: -1 });
  }

  private async confirmPaid(booking: HotelBookingDocument, payment: Payment) {
    if (toCents(payment.amount) !== booking.totalAmountCents)
      throw new ConflictException({
        code: 'PAYMENT_AMOUNT_MISMATCH',
        message: 'Verified payment amount does not match the reservation total',
      });
    const now = this.clock.now();
    const outcome = await this.db.transaction(async (session) => {
      const current = await this.bookings
        .findOne({ _id: booking._id, status: HotelBookingStatus.PENDING_PAYMENT })
        .session(session);
      if (!current) return { booking: null, failure: null };

      let failure: string | null = null;
      const owned = await this.locks.countDocuments({ bookingId: current._id }).session(session);
      if (owned !== current.rooms.length * current.nights) failure = 'HOLD_EXPIRED';
      if (!failure) {
        // Serialises with account deactivation (ACC-12) through the same user document.
        const touched = await this.users.updateOne(
          { _id: current.userId, status: AccountStatus.ACTIVE },
          { $set: { updatedAt: now } },
          { session, timestamps: false },
        );
        if (!touched.matchedCount) failure = 'ACCOUNT_NOT_ACTIVE';
      }
      if (!failure) {
        const hotel = await this.inventory.getHotel(current.providerId.toString(), session);
        if (!hotel?.active) failure = 'HOTEL_NOT_BOOKABLE';
      }

      if (failure) {
        current.status = HotelBookingStatus.EXPIRED;
        current.expiredAt = now;
        await current.save({ session });
        await this.locks.deleteMany({ bookingId: current._id }, { session });
        return { booking: current, failure };
      }

      await this.locks.updateMany(
        { bookingId: current._id },
        { $unset: { expiresAt: 1 } },
        { session },
      );
      current.status = HotelBookingStatus.CONFIRMED;
      current.reference = generateReference();
      current.confirmedAt = now;
      current.paymentId = payment.id as string;
      await current.save({ session });
      return { booking: current, failure: null };
    });

    if (!outcome.booking) {
      const latest = await this.bookings.findById(booking._id);
      if (latest?.status === HotelBookingStatus.CONFIRMED) return latest;
      throw new ConflictException({
        code: 'BOOKING_NOT_PENDING',
        message: 'Reservation is no longer pending payment',
      });
    }

    if (outcome.failure) {
      // The user paid but the reservation can no longer be honoured: full refund.
      await this.refundInFull(outcome.booking);
      throw new ConflictException({
        code: outcome.failure,
        message: 'Reservation could not be confirmed; the payment is refunded in full',
      });
    }

    await this.notify(outcome.booking.userId, {
      title: 'Hotel reservation confirmed',
      message: `Reservation ${outcome.booking.reference} at ${outcome.booking.hotelName} (${outcome.booking.checkInDate} to ${outcome.booking.checkOutDate}) is confirmed.`,
      type: NotificationType.BOOKING_CONFIRMED,
      metadata: {
        bookingId: outcome.booking.id as string,
        bookingType: BookingType.HOTEL,
        reference: outcome.booking.reference,
      },
    });
    return outcome.booking;
  }

  private async refundInFull(booking: HotelBookingDocument) {
    try {
      await this.refunds.processRefund(booking.userId.toString(), {
        bookingId: booking.id as string,
        bookingType: BookingType.HOTEL,
        reason: 'PROVIDER_CANCELLATION',
      });
    } catch (error) {
      this.logger.error(
        `Full refund failed for expired paid hotel booking ${booking.id as string}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  // ---------------------------------------------------------------- HTL-20: history

  async list(actor: Principal, query: HotelBookingListQuery) {
    const userId = new Types.ObjectId(actor.id);
    await this.refreshLifecycle({ userId });
    const filter = { userId, status: { $in: GROUP_FILTERS[query.group] } };
    const sort: Record<string, 1 | -1> =
      query.group === HotelBookingGroup.UPCOMING
        ? { checkInAt: 1, _id: 1 }
        : query.group === HotelBookingGroup.PAST
          ? { checkInAt: -1, _id: -1 }
          : { updatedAt: -1, _id: -1 };
    const [items, total, counts] = await Promise.all([
      this.bookings
        .find(filter)
        .sort(sort)
        .skip((query.page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE),
      this.bookings.countDocuments(filter),
      this.groupCounts(userId),
    ]);
    return {
      group: query.group,
      counts,
      items: items.map((b) => this.toView(b)),
      total,
      page: query.page,
      pageCount: Math.ceil(total / PAGE_SIZE),
    };
  }

  private async groupCounts(userId: Types.ObjectId) {
    const rows = await this.bookings.aggregate<{ _id: HotelBookingStatus; n: number }>([
      { $match: { userId } },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]);
    const byStatus = new Map(rows.map((r) => [r._id, r.n]));
    const sum = (statuses: HotelBookingStatus[]) =>
      statuses.reduce((total, s) => total + (byStatus.get(s) ?? 0), 0);
    return {
      [HotelBookingGroup.UPCOMING]: sum(GROUP_FILTERS[HotelBookingGroup.UPCOMING]),
      [HotelBookingGroup.PAST]: sum(GROUP_FILTERS[HotelBookingGroup.PAST]),
      [HotelBookingGroup.CANCELLED]: sum(GROUP_FILTERS[HotelBookingGroup.CANCELLED]),
    };
  }

  /** Owner, or the moderator of the booking's hotel (ACC-11). Others get 404 / 403. */
  async getOne(actor: Principal, bookingId: string) {
    const scope = this.policy.bookingQuery(actor);
    await this.refreshLifecycle({ _id: new Types.ObjectId(bookingId) });
    const booking = await this.bookings.findOne({ _id: bookingId, ...scope });
    if (!booking) throw this.notFound();
    return this.toView(booking);
  }

  // ---------------------------------------------------------------- HTL-21: cancellation

  async cancellationQuote(actor: Principal, bookingId: string) {
    const booking = await this.findOwned(actor, bookingId);
    const quote = this.computeCancellation(booking, this.clock.now());
    return {
      bookingId: booking.id as string,
      reference: booking.reference ?? null,
      checkInDate: booking.checkInDate,
      eligible: quote.eligible,
      reason: quote.reason,
      daysBefore: quote.daysBefore,
      refundPercentage: quote.refundPercentage,
      refundAmount:
        quote.refundAmountCents === undefined ? undefined : centsToDecimal(quote.refundAmountCents),
      total: centsToDecimal(booking.totalAmountCents),
      currency: booking.currency,
      cancellationTiers: booking.policy.cancellationTiers,
    };
  }

  async cancel(actor: Principal, bookingId: string) {
    const booking = await this.findOwned(actor, bookingId);
    const now = this.clock.now();
    const quote = this.computeCancellation(booking, now);
    if (!quote.eligible)
      throw new ConflictException({
        code: quote.reason,
        message:
          quote.reason === 'CHECK_IN_DATE_REACHED'
            ? 'Reservations can only be cancelled before the check-in date'
            : 'Only confirmed reservations can be cancelled',
      });
    const refundPercentage = quote.refundPercentage ?? 0;
    const cancellation: CancellationRecord = {
      daysBefore: quote.daysBefore ?? 0,
      refundPercentage,
      refundAmountCents: quote.refundAmountCents ?? 0,
      refundStatus: refundPercentage > 0 ? 'PENDING' : 'NOT_APPLICABLE',
      cancelledBy: 'USER',
    };

    const cancelled = await this.db.transaction(async (session) => {
      const doc = await this.bookings.findOneAndUpdate(
        { _id: booking._id, userId: booking.userId, status: HotelBookingStatus.CONFIRMED },
        { $set: { status: HotelBookingStatus.CANCELLED, cancelledAt: now, cancellation } },
        { new: true, session },
      );
      if (!doc)
        throw new ConflictException({
          code: 'BOOKING_NOT_CONFIRMED',
          message: 'Only confirmed reservations can be cancelled',
        });
      // Whole-reservation cancellation releases every room-night it claimed.
      await this.locks.deleteMany({ bookingId: doc._id }, { session });
      return doc;
    });

    if (refundPercentage > 0) {
      // PAY-03 (Divan) issues the Stripe refund and the refund notification.
      try {
        const result = await this.refunds.processRefund(
          actor.id,
          {
            bookingId: cancelled.id as string,
            bookingType: BookingType.HOTEL,
            reason: 'USER_CANCELLATION',
            daysBefore: cancellation.daysBefore,
          },
          cancelled.policy.cancellationTiers,
        );
        cancellation.refundStatus = 'SUCCEEDED';
        if ('refundId' in result) cancellation.refundId = result.refundId as string;
      } catch (error) {
        cancellation.refundStatus = 'FAILED';
        this.logger.error(
          `Refund failed for cancelled hotel booking ${cancelled.id as string}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
      await this.bookings.updateOne({ _id: cancelled._id }, { $set: { cancellation } });
      cancelled.cancellation = cancellation;
    }

    await this.notify(cancelled.userId, {
      title: 'Hotel reservation cancelled',
      message: `Reservation ${cancelled.reference} at ${cancelled.hotelName} was cancelled. Refund: ${centsToDecimal(cancellation.refundAmountCents)} ${cancelled.currency} (${refundPercentage}%).`,
      type: NotificationType.BOOKING_CANCELLED,
      metadata: {
        bookingId: cancelled.id as string,
        bookingType: BookingType.HOTEL,
        reference: cancelled.reference,
      },
    });
    return this.toView(cancelled);
  }

  /** HTL-21 with HTL-10 tiers, using the refund rules owned by payments (PAY-03). */
  computeCancellation(booking: HotelBookingDocument, now: Date): CancellationQuote {
    if (booking.status !== HotelBookingStatus.CONFIRMED)
      return { eligible: false, reason: 'BOOKING_NOT_CONFIRMED' };
    const today = localDate(now, booking.timeZone);
    if (today >= booking.checkInDate) return { eligible: false, reason: 'CHECK_IN_DATE_REACHED' };
    const daysBefore = daysBetween(today, booking.checkInDate);
    const refundPercentage = this.refunds.calculateRefundPercentage(
      'USER_CANCELLATION',
      daysBefore,
      booking.policy.cancellationTiers,
    );
    return {
      eligible: true,
      daysBefore,
      refundPercentage,
      refundAmountCents: Math.round((booking.totalAmountCents * refundPercentage) / 100),
    };
  }

  // ---------------------------------------------------------------- GEN-11 lifecycle

  /** HTL-23: CONFIRMED -> COMPLETED once the check-out instant has passed. */
  async completeDueStays(now: Date, extra: FilterQuery<HotelBooking> = {}) {
    const result = await this.bookings.updateMany(
      { ...extra, status: HotelBookingStatus.CONFIRMED, checkOutAt: { $lte: now } },
      { $set: { status: HotelBookingStatus.COMPLETED, completedAt: now } },
    );
    return result.modifiedCount;
  }

  /** HTL-18: PENDING_PAYMENT -> EXPIRED after 10 minutes, releasing the rooms. */
  async expireDueHolds(now: Date, extra: FilterQuery<HotelBooking> = {}) {
    const due = await this.bookings
      .find(
        { ...extra, status: HotelBookingStatus.PENDING_PAYMENT, holdExpiresAt: { $lte: now } },
        { _id: 1 },
      )
      .limit(500)
      .lean();
    if (!due.length) return 0;
    // A hold whose payment already succeeded is left to confirmation (or its full refund).
    const paid = new Set(
      (
        await this.payments
          .find(
            {
              bookingId: { $in: due.map((d) => d._id.toString()) },
              bookingType: BookingType.HOTEL,
              status: PaymentStatus.SUCCEEDED,
            },
            { bookingId: 1 },
          )
          .lean()
      ).map((p) => p.bookingId),
    );
    let expired = 0;
    for (const { _id } of due) {
      if (paid.has(_id.toString())) continue;
      const result = await this.bookings.updateOne(
        { _id, status: HotelBookingStatus.PENDING_PAYMENT },
        { $set: { status: HotelBookingStatus.EXPIRED, expiredAt: now } },
      );
      if (result.modifiedCount) {
        await this.locks.deleteMany({ bookingId: _id });
        expired += 1;
      }
    }
    return expired;
  }

  /** Confirms holds whose payment the webhook has verified, without a client round-trip. */
  async confirmPaidHolds() {
    const pending = await this.bookings
      .find({ status: HotelBookingStatus.PENDING_PAYMENT })
      .sort({ createdAt: 1 })
      .limit(200);
    let confirmed = 0;
    for (const booking of pending) {
      const payment = await this.findSucceededPayment(booking);
      if (!payment) continue;
      try {
        await this.confirmPaid(booking, payment);
        confirmed += 1;
      } catch (error) {
        this.logger.warn(
          `Automatic confirmation failed for hotel booking ${booking.id as string}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }
    return confirmed;
  }

  /** Refunds payments that succeeded for holds which had already expired. */
  async refundPaidExpiredHolds() {
    const paid = await this.payments
      .find({ bookingType: BookingType.HOTEL, status: PaymentStatus.SUCCEEDED }, { bookingId: 1 })
      .limit(500)
      .lean();
    const ids = paid.map((p) => p.bookingId).filter((id) => Types.ObjectId.isValid(id));
    const expired = await this.bookings.find({
      _id: { $in: ids },
      status: HotelBookingStatus.EXPIRED,
    });
    for (const booking of expired) await this.refundInFull(booking);
    return expired.length;
  }

  async sweep() {
    const confirmed = await this.confirmPaidHolds();
    await this.refundPaidExpiredHolds();
    const now = this.clock.now();
    const expired = await this.expireDueHolds(now);
    const completed = await this.completeDueStays(now);
    return { confirmed, expired, completed };
  }

  private async refreshLifecycle(scope: FilterQuery<HotelBooking>) {
    const now = this.clock.now();
    await this.expireDueHolds(now, scope);
    await this.completeDueStays(now, scope);
  }

  // ---------------------------------------------------------------- teammate integration

  /** BOOKING_ACCESS hotel half (ACC-12): CONFIRMED stay whose check-out is still ahead. */
  async hasUpcomingConfirmedBookings(userId: string, now: Date, session: ClientSession) {
    const found = await this.bookings
      .exists({
        userId: new Types.ObjectId(userId),
        status: HotelBookingStatus.CONFIRMED,
        checkOutAt: { $gt: now },
      })
      .session(session);
    return !!found;
  }

  /**
   * BOOKING_READER hotel half (ACC-17). Returns the hotel `total` and the first `limit` rows sorted
   * by start date desc, so a composite adapter can merge flights and hotels before paginating.
   */
  async findBookingSummaries(
    filters: BookingFilters,
    limit: number,
  ): Promise<{ items: BookingSummary[]; total: number }> {
    const query: FilterQuery<HotelBooking> = {};
    if (filters.status) {
      const statuses = (Object.keys(SUMMARY_STATUS) as HotelBookingStatus[]).filter(
        (s) => SUMMARY_STATUS[s] === filters.status,
      );
      query.status = { $in: statuses };
    }
    const range: Record<string, Date> = {};
    if (filters.startDate) range.$gte = new Date(filters.startDate);
    if (filters.endDate) range.$lte = new Date(filters.endDate);
    if (Object.keys(range).length) query.checkInAt = range;
    const [rows, total] = await Promise.all([
      this.bookings.find(query).sort({ checkInAt: -1, reference: 1, _id: 1 }).limit(limit),
      this.bookings.countDocuments(query),
    ]);
    const names = await this.userNames(rows.map((r) => r.userId));
    return {
      total,
      items: rows.map((b) => ({
        reference: b.reference ?? `PENDING-${b.id as string}`,
        type: 'HOTEL',
        user: { id: b.userId.toString(), name: names.get(b.userId.toString()) ?? 'Unknown user' },
        provider: { id: b.providerId.toString(), name: b.hotelName },
        startDate: b.checkInAt.toISOString(),
        endDate: b.checkOutAt.toISOString(),
        amount: { value: centsToDecimal(b.totalAmountCents), currency: b.currency },
        status: SUMMARY_STATUS[b.status],
      })),
    };
  }

  /**
   * HTL-05/HTL-06 (Magdy): true if any PENDING_PAYMENT (unexpired) or CONFIRMED reservation holds
   * the room on a night in [fromDate, toDate). Use before blocking, deactivating or deleting.
   */
  async hasActiveReservationsForRoom(roomId: string, fromDate: string, toDate: string) {
    const now = this.clock.now();
    const found = await this.locks.exists({
      roomId: new Types.ObjectId(roomId),
      night: { $gte: fromDate, $lt: toDate },
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
    });
    return !!found;
  }

  /** HTL-08 (Magdy): booked room-nights with the reservation reference for a date range. */
  async getRoomNightClaims(roomIds: string[], fromDate: string, toDate: string) {
    const now = this.clock.now();
    const claims = await this.locks
      .find({
        roomId: { $in: roomIds.map((id) => new Types.ObjectId(id)) },
        night: { $gte: fromDate, $lt: toDate },
        $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
      })
      .lean();
    const bookings = await this.bookings
      .find({ _id: { $in: claims.map((c) => c.bookingId) } }, { reference: 1, status: 1 })
      .lean();
    const byId = new Map(bookings.map((b) => [b._id.toString(), b]));
    return claims.map((c) => ({
      roomId: c.roomId.toString(),
      night: c.night,
      bookingId: c.bookingId.toString(),
      reference: byId.get(c.bookingId.toString())?.reference ?? null,
      status: byId.get(c.bookingId.toString())?.status ?? null,
    }));
  }

  /** HTL-22 (Magdy's endpoint): reservations of the moderator's own hotel. */
  async findHotelReservations(actor: Principal, hotelId: string, page = 1) {
    this.policy.providerScope(actor, 'HOTEL', hotelId);
    const filter = {
      providerId: new Types.ObjectId(hotelId),
      status: { $ne: HotelBookingStatus.EXPIRED },
    };
    const [rows, total] = await Promise.all([
      this.bookings
        .find(filter)
        .sort({ checkInAt: -1, _id: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE),
      this.bookings.countDocuments(filter),
    ]);
    const names = await this.userNames(rows.map((r) => r.userId));
    return {
      items: rows.map((b) => ({
        ...this.toView(b),
        guest: { id: b.userId.toString(), name: names.get(b.userId.toString()) ?? 'Unknown user' },
      })),
      total,
      page,
      pageCount: Math.ceil(total / PAGE_SIZE),
    };
  }

  // ---------------------------------------------------------------- helpers

  async findOwned(actor: Principal, bookingId: string) {
    await this.refreshLifecycle({ _id: new Types.ObjectId(bookingId) });
    const booking = await this.bookings.findOne({
      _id: bookingId,
      userId: new Types.ObjectId(actor.id),
    });
    if (!booking) throw this.notFound();
    return booking;
  }

  private async userNames(ids: Types.ObjectId[]) {
    const users = await this.users.find({ _id: { $in: ids } }, { name: 1 }).lean();
    return new Map(users.map((u) => [u._id.toString(), u.name]));
  }

  private async notify(
    userId: Types.ObjectId,
    data: {
      title: string;
      message: string;
      type: NotificationType;
      metadata: Record<string, unknown>;
    },
  ) {
    try {
      await this.notifications.createNotification({ userId, ...data });
    } catch (error) {
      this.logger.warn(
        `Notification failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private notFound() {
    return new NotFoundException({ code: 'BOOKING_NOT_FOUND', message: 'Reservation not found' });
  }

  toView(b: HotelBookingDocument) {
    const now = this.clock.now();
    return {
      id: b.id as string,
      reference: b.reference ?? null,
      status: b.status,
      hotel: { id: b.providerId.toString(), name: b.hotelName },
      checkInDate: b.checkInDate,
      checkOutDate: b.checkOutDate,
      checkInAt: b.checkInAt,
      checkOutAt: b.checkOutAt,
      timeZone: b.timeZone,
      nights: b.nights,
      rooms: b.rooms.map((r) => ({
        roomId: r.roomId.toString(),
        name: r.roomName,
        type: r.roomType,
        beds: r.beds,
        adults: r.adults,
        children: r.childrenAges.length,
        childrenAges: r.childrenAges,
        pricePerNight: centsToDecimal(r.pricePerNightCents),
        subtotal: centsToDecimal(r.subtotalCents),
      })),
      guests: {
        adults: b.rooms.reduce((n, r) => n + r.adults, 0),
        children: b.rooms.reduce((n, r) => n + r.childrenAges.length, 0),
      },
      total: { amount: centsToDecimal(b.totalAmountCents), currency: b.currency },
      policy: {
        checkInTime: b.policy.checkInTime,
        checkOutTime: b.policy.checkOutTime,
        cancellationTiers: b.policy.cancellationTiers.map((t) => ({
          daysBefore: t.daysBefore,
          refundPercentage: t.refundPercentage,
        })),
      },
      holdExpiresAt: b.status === HotelBookingStatus.PENDING_PAYMENT ? b.holdExpiresAt : undefined,
      canCancel: this.computeCancellation(b, now).eligible,
      paymentId: b.paymentId,
      confirmedAt: b.confirmedAt,
      completedAt: b.completedAt,
      cancelledAt: b.cancelledAt,
      expiredAt: b.expiredAt,
      cancellation: b.cancellation
        ? {
            daysBefore: b.cancellation.daysBefore,
            refundPercentage: b.cancellation.refundPercentage,
            refundAmount: centsToDecimal(b.cancellation.refundAmountCents),
            refundStatus: b.cancellation.refundStatus,
            refundId: b.cancellation.refundId,
          }
        : undefined,
      createdAt: b.createdAt,
    };
  }
}
