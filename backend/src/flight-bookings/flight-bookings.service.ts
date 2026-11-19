import {
  BadRequestException, ConflictException, Inject, Injectable, Logger,
  NotFoundException, Optional,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, FilterQuery, Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import { Flight } from '../flights/flights.schema';
import { Airport } from '../reference-data/reference.schema';
import { BookingLeg, FlightBooking } from './flight-booking.schema';
import { CreateFlightBookingDto, ListBookingsQuery } from './flight-bookings.dto';
import { User } from '../users/user.schema';
import { AccountStatus } from '../common/domain';
import { Payment } from '../payments/payments.schema';
import { BookingType, PaymentStatus } from '../payments/payments.constants';
import { Notification, NotificationType } from '../notifications/notifications.schema';

export const HOLD_MS = 10 * 60 * 1000; // exactly 10 minutes
export const REFUNDS_PORT = 'REFUNDS_PORT';
const CURRENCY = 'USD'; // Yassin's flight schema has no currency field

// ADAPT (Divan): implement this with his RefundsService, then provide it under REFUNDS_PORT.
export interface RefundsPort {
  requestRefund(input: {
    bookingType: 'flight';
    bookingId: string;
    userId: string;
    amount: number;
    reason: string;
  }): Promise<void>;
}

type FlightLean = {
  _id: Types.ObjectId;
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  departureTimeUtc: Date;
  arrivalTimeUtc: Date;
  status: string;
  cabins?: Record<string, { seatCount: number; price: number } | undefined>;
  extraBaggagePricePerKg?: number;
  cancellationTiers?: { hoursBeforeDeparture: number; refundPercentage: number }[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeReference = () =>
  Array.from(randomBytes(8), (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
const toOid = (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Not found');
  return new Types.ObjectId(id);
};
const localTime = (d: Date, zone?: string) => {
  try {
    return d.toLocaleString('sv-SE', { timeZone: zone ?? 'UTC', hour12: false });
  } catch {
    return d.toISOString();
  }
};

@Injectable()
export class FlightBookingsService {
  private readonly log = new Logger(FlightBookingsService.name);

  constructor(
    @InjectModel(Flight.name) private readonly flights: Model<Flight>,
    @InjectModel(Airport.name) private readonly airports: Model<Airport>,
    @InjectModel(FlightBooking.name) private readonly bookings: Model<FlightBooking>,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Payment.name) private readonly payments: Model<Payment>,
    @InjectModel(Notification.name) private readonly notifications: Model<Notification>,
    @Optional() @Inject(REFUNDS_PORT) private readonly refunds?: RefundsPort,
  ) {}

  // ---------- inventory: cabins.<key>.seatCount IS the live availability ----------
  private async takeSeats(flightId: Types.ObjectId, cabinKey: string, n: number, s: ClientSession) {
    const path = `cabins.${cabinKey}.seatCount`; // cabinKey is whitelisted by the DTO
    const res = await this.flights.updateOne(
      {
        _id: flightId,
        status: 'SCHEDULED',
        departureTimeUtc: { $gt: new Date() },
        [path]: { $gte: n },
      } as unknown as FilterQuery<Flight>,
      { $inc: { [path]: -n } },
      { session: s },
    );
    if (res.modifiedCount !== 1) {
      throw new ConflictException('Not enough seats available in this cabin');
    }
  }

  private async releaseSeats(legs: BookingLeg[], n: number, s: ClientSession) {
    for (const leg of legs) {
      await this.flights.updateOne(
        { _id: leg.flightId } as unknown as FilterQuery<Flight>,
        { $inc: { [`cabins.${leg.cabinClass}.seatCount`]: n } },
        { session: s },
      );
    }
  }

  // ---------- FLT-19 / FLT-21: passengers, baggage, totals, summary (no inventory touched) ----------
  async createDraft(userId: string, dto: CreateFlightBookingDto) {
    const seatCount = dto.passengers.filter((p) => p.type !== 'infant').length;
    if (seatCount < 1) throw new BadRequestException('At least one adult or child passenger is required');
    const bagKg = dto.passengers.reduce((sum, p) => sum + (p.extraBaggageKg ?? 0), 0);

    const legs: BookingLeg[] = [];
    let policy: FlightBooking['cancellationPolicy'] = [];
    for (const [i, l] of dto.legs.entries()) {
      const flight = (await this.flights.findById(toOid(l.flightId)).lean()) as unknown as FlightLean | null;
      if (!flight || flight.status !== 'SCHEDULED') throw new NotFoundException('Flight not available');
      if (flight.departureTimeUtc <= new Date()) throw new BadRequestException('Flight already departed');
      const cabin = flight.cabins?.[l.cabinClass];
      if (!cabin) throw new NotFoundException(`Cabin ${l.cabinClass} not found on flight`);
      if (cabin.seatCount < seatCount) throw new ConflictException('Not enough seats available in this cabin');
      const previous = legs[i - 1];
      if (previous && flight.departureTimeUtc <= previous.arrivalTime) {
        throw new BadRequestException('Return flight must depart after the outbound arrives');
      }
      if (i === 0) policy = flight.cancellationTiers ?? [];
      const baggageCost = round2(bagKg * (flight.extraBaggagePricePerKg ?? 0));
      legs.push({
        flightId: flight._id,
        flightNumber: flight.flightNumber,
        cabinClass: l.cabinClass,
        departureAirport: flight.departureAirport,
        arrivalAirport: flight.arrivalAirport,
        departureTime: flight.departureTimeUtc,
        arrivalTime: flight.arrivalTimeUtc,
        farePerSeat: cabin.price, // price snapshot, taken server-side only
        baggageCost,
        legTotal: round2(cabin.price * seatCount + baggageCost),
      });
    }

    const base = {
      userId: new Types.ObjectId(userId),
      status: 'DRAFT' as const,
      legs,
      passengers: dto.passengers.map((p) => ({
        ...p,
        dateOfBirth: new Date(p.dateOfBirth),
        extraBaggageKg: p.extraBaggageKg ?? 0,
      })),
      seatCount,
      currency: CURRENCY,
      totalPrice: round2(legs.reduce((sum, l) => sum + l.legTotal, 0)),
      firstDeparture: legs[0].departureTime,
      lastDeparture: legs[legs.length - 1].departureTime,
      cancellationPolicy: policy,
    };
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const doc = await this.bookings.create({ ...base, reference: makeReference() });
        return doc.toObject();
      } catch (e) {
        if ((e as { code?: number }).code !== 11000) throw e; // retry only on duplicate reference
      }
    }
    throw new ConflictException('Could not generate a unique booking reference');
  }

  // ---------- FLT-22: atomic 10-minute hold, all legs in one transaction ----------
  async hold(userId: string, bookingId: string) {
    const _id = toOid(bookingId);
    const owner = new Types.ObjectId(userId);
    const exists = await this.bookings.exists({ _id, userId: owner });
    if (!exists) throw new NotFoundException('Booking not found');

    const holdExpiresAt = new Date(Date.now() + HOLD_MS);
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const b = await this.bookings.findOneAndUpdate(
          { _id, userId: owner, status: 'DRAFT' },
          { $set: { status: 'PENDING', holdExpiresAt } },
          { new: true, session },
        );
        if (!b) throw new ConflictException('Booking is not in a holdable state');
        for (const leg of b.legs) await this.takeSeats(leg.flightId, leg.cabinClass, b.seatCount, session);
      });
    } finally {
      await session.endSession();
    }
    return this.bookings.findById(_id).lean();
  }

  // ---------- Called by Divan after he VERIFIES the Stripe payment ----------
  async confirmPayment(bookingId: string, paymentId: string) {
    const _id = toOid(bookingId);
    const paidId = toOid(paymentId);
    const result = await this.connection.transaction(async (session) => {
      const booking = await this.bookings.findById(_id).session(session);
      if (!booking) throw new NotFoundException('Booking not found');
      const payment = await this.payments.findOne({
        _id: paidId, bookingId, bookingType: BookingType.FLIGHT,
        userId: booking.userId, status: PaymentStatus.SUCCEEDED,
      }).session(session);
      if (!payment || payment.currency !== booking.currency ||
        Math.round(payment.amount * 100) !== Math.round(booking.totalPrice * 100)) {
        throw new ConflictException('Payment is not verified for this booking');
      }
      if (booking.status === 'CONFIRMED' && booking.paymentId?.equals(paidId)) {
        return { confirmed: true as const, booking: booking.toObject() };
      }
      const now = new Date();
      if (booking.status !== 'PENDING' || !booking.holdExpiresAt || booking.holdExpiresAt <= now) {
        if (booking.status === 'PENDING') {
          booking.status = 'EXPIRED';
          booking.holdExpiresAt = undefined;
          await booking.save({ session });
          await this.releaseSeats(booking.legs, booking.seatCount, session);
        }
        return { confirmed: false as const, reason: 'HOLD_EXPIRED_OR_INVALID' };
      }
      // A real write serializes against account deactivation even within the same millisecond.
      const active = await this.users.updateOne(
        { _id: booking.userId, status: AccountStatus.ACTIVE },
        { $inc: { bookingRevision: 1 } }, { session },
      );
      if (active.modifiedCount !== 1) {
        booking.status = 'EXPIRED';
        booking.holdExpiresAt = undefined;
        await booking.save({ session });
        await this.releaseSeats(booking.legs, booking.seatCount, session);
        return { confirmed: false as const, reason: 'ACCOUNT_NOT_ACTIVE' };
      }
      for (const leg of booking.legs) {
        const flight = await this.flights.updateOne(
          { _id: leg.flightId, status: 'SCHEDULED', departureTimeUtc: { $gt: now } },
          { $set: { hasConfirmedBookings: true } }, { session },
        );
        if (flight.matchedCount !== 1) throw new ConflictException('Flight is no longer bookable');
      }
      booking.status = 'CONFIRMED';
      booking.paymentId = paidId;
      booking.confirmedAt = now;
      booking.holdExpiresAt = undefined;
      await booking.save({ session });
      await this.notifications.create([{
        userId: booking.userId, title: 'Flight Booking Confirmed',
        message: `Flight booking ${booking.reference} is confirmed.`,
        type: NotificationType.BOOKING_CONFIRMED,
        metadata: { bookingId, bookingType: BookingType.FLIGHT, reference: booking.reference },
      }], { session });
      return { confirmed: true as const, booking: booking.toObject() };
    });
    if (!result.confirmed && this.refunds) {
      const booking = await this.bookings.findById(_id).lean();
      if (booking) await this.refunds.requestRefund({ bookingId, userId: String(booking.userId), bookingType: 'flight', amount: booking.totalPrice, reason: result.reason });
    }
    return result;
  }

  // ---------- Expiry: guarded transition + release, safe to run repeatedly ----------
  async expireOne(id: Types.ObjectId) {
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const b = await this.bookings.findOneAndUpdate(
          { _id: id, status: 'PENDING', holdExpiresAt: { $lte: new Date() } },
          { $set: { status: 'EXPIRED' }, $unset: { holdExpiresAt: 1 } },
          { new: true, session },
        );
        if (b) await this.releaseSeats(b.legs, b.seatCount, session); // only the winner releases
      });
    } finally {
      await session.endSession();
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async expireDue() {
    const due = await this.bookings
      .find({ status: 'PENDING', holdExpiresAt: { $lte: new Date() } }, { _id: 1 })
      .lean();
    for (const d of due) {
      try {
        await this.expireOne(d._id);
      } catch (e) {
        this.log.error(`expire ${d._id}: ${(e as Error).message}`);
      }
    }
    // Recover a process stop between verified payment persistence and booking/refund processing.
    const paid = await this.payments.find({ bookingType: BookingType.FLIGHT, status: PaymentStatus.SUCCEEDED }).lean();
    for (const payment of paid) {
      const booking = await this.bookings.findById(payment.bookingId).lean();
      if (!booking || booking.status === 'CONFIRMED') continue;
      try { await this.confirmPayment(payment.bookingId, String(payment._id)); }
      catch (error) { this.log.error(`payment reconciliation ${payment._id}: ${(error as Error).message}`); }
    }
    return due.length;
  }

  // ---------- FLT-25 ----------
  async list(userId: string, q: ListBookingsQuery) {
    const now = new Date();
    const owner = new Types.ObjectId(userId);
    const filter =
      q.tab === 'cancelled' ? { userId: owner, status: 'CANCELLED' }
      : q.tab === 'past' ? { userId: owner, status: 'CONFIRMED', lastDeparture: { $lt: now } }
      : { userId: owner, status: 'CONFIRMED', lastDeparture: { $gte: now } }; // default = upcoming
    const page = q.page ?? 1;
    const limit = q.limit ?? 10;
    const [items, total] = await Promise.all([
      this.bookings
        .find(filter)
        .sort({ firstDeparture: q.tab === 'upcoming' || !q.tab ? 1 : -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.bookings.countDocuments(filter),
    ]);
    return { items, total, page, limit };
  }

  async getOne(userId: string, id: string) {
    const owner = new Types.ObjectId(userId);
    const oid = toOid(id);
    let b = await this.bookings.findOne({ _id: oid, userId: owner }).lean();
    if (!b) throw new NotFoundException('Booking not found'); // 404, never reveal others' bookings
    if (b.status === 'PENDING' && b.holdExpiresAt && b.holdExpiresAt <= new Date()) {
      await this.expireOne(b._id); // lazy expiry in case the cron lags
      b = await this.bookings.findById(oid).lean();
    }
    return b!;
  }

  // For Yassin's FLT-29 (moderator sees bookings of a flight)
  async findConfirmedByFlight(flightId: string) {
    return this.bookings.find({ status: 'CONFIRMED', 'legs.flightId': toOid(flightId) }).lean();
  }

  // ---------- FLT-23 ----------
  async eTicket(userId: string, id: string) {
    const b = await this.getOne(userId, id);
    if (b.status !== 'CONFIRMED') throw new ConflictException('E-ticket is only available for confirmed bookings');

    const codes = Array.from(new Set(b.legs.flatMap((l) => [l.departureAirport, l.arrivalAirport])));
    const rows = (await this.airports
      .find({ iataCode: { $in: codes } } as unknown as FilterQuery<Airport>)
      .lean()) as unknown as { iataCode: string; timeZone?: string }[];
    const zone = new Map(rows.map((r) => [r.iataCode, r.timeZone]));

    return {
      reference: b.reference,
      passengers: b.passengers.map((p) => ({
        name: `${p.firstName} ${p.lastName}`, type: p.type, extraBaggageKg: p.extraBaggageKg,
      })),
      legs: b.legs.map((l) => ({
        flightNumber: l.flightNumber,
        cabinClass: l.cabinClass,
        from: l.departureAirport,
        to: l.arrivalAirport,
        departureUtc: l.departureTime,
        arrivalUtc: l.arrivalTime,
        departureLocal: localTime(l.departureTime, zone.get(l.departureAirport)), // airport IANA zone
        arrivalLocal: localTime(l.arrivalTime, zone.get(l.arrivalAirport)),
      })),
      totalPaid: b.totalPrice,
      currency: b.currency,
      issuedAt: b.confirmedAt,
    };
  }

  // ---------- FLT-26 ----------
  refundPercentFor(policy: FlightBooking['cancellationPolicy'], hoursBefore: number) {
    const tiers = [...policy].sort((a, b) => b.hoursBeforeDeparture - a.hoursBeforeDeparture);
    return tiers.find((t) => hoursBefore >= t.hoursBeforeDeparture)?.refundPercentage ?? 0;
  }

  async cancel(userId: string, id: string) {
    const current = await this.getOne(userId, id);
    const hoursBefore = (current.firstDeparture.getTime() - Date.now()) / 3_600_000;
    if (hoursBefore <= 0) throw new BadRequestException('Flight has already departed');
    const refundAmount = round2(
      (current.totalPrice * this.refundPercentFor(current.cancellationPolicy, hoursBefore)) / 100,
    );

    const session = await this.connection.startSession();
    let didCancel = false;
    try {
      await session.withTransaction(async () => {
        const b = await this.bookings
          .findOneAndUpdate(
            { _id: current._id, userId: current.userId, status: 'CONFIRMED' },
            { $set: { status: 'CANCELLED', cancelledAt: new Date(), refundAmount, refundStatus: refundAmount > 0 ? 'PENDING' : 'NOT_APPLICABLE' } },
            { new: true, session },
          )
          .lean();
        if (!b) throw new ConflictException('Booking is not cancellable');
        await this.releaseSeats(b.legs, b.seatCount, session);
        didCancel = true;
      });
    } finally {
      await session.endSession();
    }
    // ADAPT (Divan): refund runs after the DB transaction commits
    if (refundAmount > 0 && this.refunds && didCancel) {
      await this.refunds.requestRefund({
        bookingType: 'flight', bookingId: String(current._id), userId,
        amount: refundAmount, reason: 'Customer cancellation',
      });
    }
    const updated = await this.bookings.findById(current._id).lean();
    return { reference: current.reference, status: 'CANCELLED', refundAmount, refundStatus: updated?.refundStatus, currency: current.currency };
  }
}
