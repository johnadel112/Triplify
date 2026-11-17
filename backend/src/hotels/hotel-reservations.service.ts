import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccountStatus, Principal, UserRole } from '../common/domain';
import { HotelBooking } from '../hotel-bookings/hotel-booking.schema';
import { User } from '../users/user.schema';
import { HotelReservationsQuery } from './hotel-reservations.dto';

const PAGE_SIZE = 10;

@Injectable()
export class HotelReservationsService {
  constructor(
    @InjectModel(HotelBooking.name) private readonly bookings: Model<HotelBooking>,
    @InjectModel(User.name) private readonly users: Model<User>,
  ) {}

  private checkModerator(actor: Principal, hotelId: string): void {
    if (
      actor.role !== UserRole.HOTEL_MODERATOR ||
      actor.providerType !== 'HOTEL' ||
      !actor.providerId ||
      actor.providerId.toLowerCase() !== hotelId.toLowerCase()
    ) {
      throw new ForbiddenException('You can only view bookings at your assigned hotel');
    }
  }

  /** Booking totals and nightly rates come from the saved reservation snapshot, not today's price. */
  private asView(booking: HotelBooking & { id?: string; _id?: Types.ObjectId }, guestName: string) {
    return {
      id: String(booking._id),
      reference: booking.reference ?? null,
      hotelId: String(booking.providerId),
      hotelName: booking.hotelName,
      guest: { id: String(booking.userId), name: guestName },
      checkInDate: booking.checkInDate,
      checkOutDate: booking.checkOutDate,
      nights: booking.nights,
      status: booking.status,
      rooms: booking.rooms.map((room) => ({
        roomId: String(room.roomId),
        name: room.roomName,
        type: room.roomType,
        adults: room.adults,
        childrenCount: room.childrenAges.length,
        pricePerNight: room.pricePerNightCents / 100,
        subtotal: room.subtotalCents / 100,
      })),
      total: booking.totalAmountCents / 100,
      currency: booking.currency,
      createdAt: booking.createdAt,
    };
  }

  private async namesFor(bookings: HotelBooking[]) {
    const ids = [...new Set(bookings.map((booking) => String(booking.userId)))];
    if (!ids.length) return new Map<string, string>();
    const users = await this.users.find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } })
      .select('name status')
      .lean();
    return new Map(users.map((user) => [
      String(user._id),
      user.status === AccountStatus.DEACTIVATED ? 'Deleted user' : user.name,
    ]));
  }

  /** HTL-22: this moderator's hotel's bookings, not other providers' reservations. */
  async list(hotelId: string, actor: Principal, query: HotelReservationsQuery) {
    this.checkModerator(actor, hotelId);
    const filter = {
      providerId: new Types.ObjectId(hotelId),
      providerType: 'HOTEL' as const,
      ...(query.status ? { status: query.status } : {}),
    };
    const [bookings, total] = await Promise.all([
      this.bookings.find(filter)
        .select('reference providerId hotelName userId checkInDate checkOutDate nights status rooms totalAmountCents currency createdAt')
        .sort({ checkInDate: -1, _id: -1 })
        .skip((query.page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .exec(),
      this.bookings.countDocuments(filter),
    ]);
    const names = await this.namesFor(bookings);
    return {
      items: bookings.map((booking) => this.asView(booking, names.get(String(booking.userId)) ?? 'Deleted user')),
      total,
      page: query.page,
      pageCount: Math.ceil(total / PAGE_SIZE),
    };
  }

  /** HTL-22: one reservation; use the hotel ID in the DB query to prevent cross-hotel reads. */
  async getOne(hotelId: string, bookingId: string, actor: Principal) {
    this.checkModerator(actor, hotelId);
    const booking = await this.bookings.findOne({
      _id: new Types.ObjectId(bookingId),
      providerId: new Types.ObjectId(hotelId),
      providerType: 'HOTEL',
    }).select('reference providerId hotelName userId checkInDate checkOutDate nights status rooms totalAmountCents currency createdAt')
      .exec();
    if (!booking) throw new NotFoundException('Reservation not found for this hotel');
    const names = await this.namesFor([booking]);
    return this.asView(booking, names.get(String(booking.userId)) ?? 'Deleted user');
  }
}
