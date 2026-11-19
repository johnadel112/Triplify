import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Principal, UserRole } from '../common/domain';
import { HotelBooking } from '../hotel-bookings/hotel-booking.schema';
import { HotelBookingStatus } from '../hotel-bookings/hotel-bookings.constants';
import { RoomNightLock } from '../hotel-bookings/hotel-booking.schema';
import { Review } from '../hotel-bookings/review.schema';
import { PLATFORM_CURRENCY } from '../payments/payments.constants';
import { AvailableRoomsQuery, HotelSearchQuery, RoomStatusQuery } from './hotel-discovery.dto';
import { isCalendarDate, hotelToday } from './hotel-ranges';
import { Hotel } from './hotel.schema';
import { Room } from './room.schema';
import { roomCoversStay, selectCheapestRoomSet, stayNights } from './hotel-discovery.utils';

const PAGE_SIZE = 10;
const MAX_NIGHTS = 30;

interface PublicRoom {
  id: string;
  hotelId: string;
  name: string;
  number: string;
  type: string;
  beds: number;
  maxOccupancy: number;
  pricePerNight: number;
}

const escapedExactRegex = (value: string): RegExp =>
  new RegExp(`^${value.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

const decimal = (cents: number): number => cents / 100;

@Injectable()
export class HotelDiscoveryService {
  constructor(
    @InjectModel(Hotel.name) private readonly hotels: Model<Hotel>,
    @InjectModel(Room.name) private readonly rooms: Model<Room>,
    @InjectModel(RoomNightLock.name) private readonly locks: Model<RoomNightLock>,
    @InjectModel(HotelBooking.name) private readonly bookings: Model<HotelBooking>,
    @InjectModel(Review.name) private readonly reviews: Model<Review>,
  ) {}

  private validateDates(from: string, to: string): string[] {
    if (!isCalendarDate(from) || !isCalendarDate(to) || from >= to) {
      throw new BadRequestException('Provide real YYYY-MM-DD dates with check-out after check-in');
    }
    const nights = stayNights(from, to);
    if (nights.length < 1 || nights.length > MAX_NIGHTS) {
      throw new BadRequestException(`Stay or status range must cover 1-${MAX_NIGHTS} nights`);
    }
    return nights;
  }

  /** Get free physical rooms: within offered ranges, not blocked, without a live room-night lock. */
  private async freeRoomsForHotels(hotelIds: string[], nights: string[]): Promise<Map<string, PublicRoom[]>> {
    const result = new Map<string, PublicRoom[]>(hotelIds.map((id) => [id, []]));
    if (!hotelIds.length) return result;

    const allRooms = await this.rooms.find({
      hotelId: { $in: hotelIds.map((id) => new Types.ObjectId(id)) },
      active: true,
    }).lean();
    const offering = allRooms.filter((room) => roomCoversStay(room, nights));
    if (!offering.length) return result;

    const roomIds = offering.map((room) => room._id);
    const claimedIds = await this.locks.distinct('roomId', {
      roomId: { $in: roomIds },
      night: { $gte: nights[0], $lte: nights[nights.length - 1] },
      $or: [
        { expiresAt: { $exists: false } }, // Confirmed booking.
        { expiresAt: { $gt: new Date() } }, // Unexpired pending-payment hold.
      ],
    });
    const occupied = new Set(claimedIds.map((id) => String(id)));

    for (const room of offering) {
      if (occupied.has(String(room._id))) continue;
      const hotelId = String(room.hotelId);
      const list = result.get(hotelId);
      if (!list) continue;
      list.push({
        id: String(room._id),
        hotelId,
        name: room.name,
        number: room.number,
        type: room.type,
        beds: room.beds,
        maxOccupancy: room.maxOccupancy,
        pricePerNight: room.pricePerNight,
      });
    }
    for (const list of result.values()) {
      list.sort((a, b) => a.pricePerNight - b.pricePerNight || a.number.localeCompare(b.number));
    }
    return result;
  }

  /** Average is calculated from visible reviews, never a stale cached hotel.rating. */
  private async ratingSummaries(ids: string[]) {
    if (!ids.length) return new Map<string, { averageRating: number; ratingCount: number }>();
    const rows = await this.reviews.aggregate<{
      _id: Types.ObjectId; avg: number; n: number;
    }>([
      { $match: { hotelId: { $in: ids.map((id) => new Types.ObjectId(id)) }, hidden: false } },
      { $group: { _id: '$hotelId', avg: { $avg: '$rating' }, n: { $sum: 1 } } },
    ]);
    return new Map(rows.map((row) => [String(row._id), {
      averageRating: Math.round(row.avg * 10) / 10,
      ratingCount: row.n,
    }]));
  }

  /** HTL-11/12: search by destination, dates, guests, room count, price, average review rating. */
  async search(query: HotelSearchQuery) {
    const nights = this.validateDates(query.checkInDate, query.checkOutDate);
    if (!query.city?.trim() && !query.country?.trim()) {
      throw new BadRequestException('Specify a city or country');
    }
    if (query.minPrice !== undefined && query.maxPrice !== undefined && query.minPrice > query.maxPrice) {
      throw new BadRequestException('minPrice cannot be greater than maxPrice');
    }
    if (query.guests < query.rooms) {
      throw new BadRequestException('Guest count must be at least the number of requested rooms');
    }
    const hotelFilter: Record<string, unknown> = { active: true, verified: true };
    if (query.city?.trim()) hotelFilter.city = escapedExactRegex(query.city);
    if (query.country?.trim()) hotelFilter.country = escapedExactRegex(query.country);

    const hotels = await this.hotels.find(hotelFilter)
      .select('name description city country address starClass images amenities timeZone checkInTime checkOutTime cancellationTiers')
      .lean();
    const eligibleHotels = hotels.filter((hotel) =>
      query.checkInDate >= hotelToday(hotel.timeZone),
    );
    const ids = eligibleHotels.map((hotel) => String(hotel._id));
    const [freeByHotel, ratings] = await Promise.all([
      this.freeRoomsForHotels(ids, nights),
      this.ratingSummaries(ids),
    ]);

    const matches = eligibleHotels.flatMap((hotel) => {
      const id = String(hotel._id);
      const free = freeByHotel.get(id) ?? [];
      const chosen = selectCheapestRoomSet(free, query.rooms, query.guests);
      if (!chosen) return [];
      const priceOfCheapestQualifyingRoom = Math.min(...chosen.map((r) => r.pricePerNight));
      if (query.maxPrice !== undefined && priceOfCheapestQualifyingRoom > query.maxPrice) return [];
      if (query.minPrice !== undefined && priceOfCheapestQualifyingRoom < query.minPrice) return [];
      const rating = ratings.get(id);
      if (query.minRating !== undefined && (rating?.averageRating ?? 0) < query.minRating) return [];
      const nightlyCents = chosen.reduce((sum, room) => sum + Math.round(room.pricePerNight * 100), 0);
      return [{
        id,
        name: hotel.name,
        description: hotel.description,
        city: hotel.city,
        country: hotel.country,
        address: hotel.address,
        images: hotel.images,
        amenities: hotel.amenities,
        starClass: hotel.starClass,
        averageRating: rating?.averageRating ?? null,
        ratingCount: rating?.ratingCount ?? 0,
        checkInDate: query.checkInDate,
        checkOutDate: query.checkOutDate,
        nights: nights.length,
        guestCount: query.guests,
        roomCount: query.rooms,
        cheapestQualifyingRoomPricePerNight: priceOfCheapestQualifyingRoom,
        suggestedRooms: chosen,
        nightlyRoomsTotal: decimal(nightlyCents),
        stayTotal: decimal(nightlyCents * nights.length),
        currency: PLATFORM_CURRENCY,
      }];
    });
    matches.sort((a, b) => a.stayTotal - b.stayTotal || a.name.localeCompare(b.name));
    const start = (query.page - 1) * PAGE_SIZE;
    return {
      items: matches.slice(start, start + PAGE_SIZE),
      total: matches.length,
      page: query.page,
      pageCount: Math.ceil(matches.length / PAGE_SIZE),
    };
  }

  /** HTL-15: all rooms free for the requested stay, with individual stay totals. */
  async availableRooms(hotelId: string, query: AvailableRoomsQuery) {
    const nights = this.validateDates(query.checkInDate, query.checkOutDate);
    const hotel = await this.hotels.findOne({ _id: hotelId, active: true, verified: true })
      .select('name timeZone').lean();
    if (!hotel) throw new NotFoundException('Hotel not found');
    if (query.checkInDate < hotelToday(hotel.timeZone)) {
      throw new BadRequestException('Check-in cannot be in the past for the hotel');
    }
    const byHotel = await this.freeRoomsForHotels([hotelId], nights);
    return {
      hotelId,
      hotelName: hotel.name,
      checkInDate: query.checkInDate,
      checkOutDate: query.checkOutDate,
      nights: nights.length,
      currency: PLATFORM_CURRENCY,
      rooms: (byHotel.get(hotelId) ?? []).map((room) => ({
        ...room,
        canFitGuests: query.guests === undefined ? undefined : room.maxOccupancy >= query.guests,
        stayTotal: decimal(Math.round(room.pricePerNight * 100) * nights.length),
      })),
    };
  }

  /** HTL-08: per-night room status for this hotel moderator, with booking references. */
  async roomStatus(hotelId: string, roomId: string, query: RoomStatusQuery, actor: Principal) {
    if (
      actor.role !== UserRole.HOTEL_MODERATOR ||
      actor.providerType !== 'HOTEL' ||
      actor.providerId?.toLowerCase() !== hotelId.toLowerCase()
    ) {
      throw new ForbiddenException('You may only view statuses for your assigned hotel');
    }
    const nights = this.validateDates(query.from, query.to);
    const room = await this.rooms.findOne({ _id: roomId, hotelId }).lean();
    if (!room) throw new NotFoundException('Room not found in this hotel');

    const bookings = await this.bookings.find({
      providerId: new Types.ObjectId(hotelId),
      'rooms.roomId': new Types.ObjectId(roomId),
      status: { $in: [
        HotelBookingStatus.PENDING_PAYMENT,
        HotelBookingStatus.CONFIRMED,
        HotelBookingStatus.COMPLETED,
      ] },
      checkInDate: { $lt: query.to },
      checkOutDate: { $gt: query.from },
    }).select('status reference checkInDate checkOutDate holdExpiresAt').lean();

    const now = Date.now();
    const occupied = new Map<string, { bookingId: string; reference: string | null; status: string }>();
    // Confirmed/completed reservations take precedence over pending holds, if any inconsistent data exists.
    const sortedBookings = bookings.sort((a, b) =>
      (a.status === HotelBookingStatus.PENDING_PAYMENT ? -1 : 1) -
      (b.status === HotelBookingStatus.PENDING_PAYMENT ? -1 : 1),
    );
    for (const booking of sortedBookings) {
      if (booking.status === HotelBookingStatus.PENDING_PAYMENT &&
        (!booking.holdExpiresAt || booking.holdExpiresAt.getTime() <= now)) continue;
      for (const night of nights) {
        if (booking.checkInDate <= night && night < booking.checkOutDate) {
          occupied.set(night, {
            bookingId: String(booking._id),
            reference: booking.reference ?? null,
            status: booking.status,
          });
        }
      }
    }
    return {
      hotelId,
      roomId,
      roomNumber: room.number,
      from: query.from,
      to: query.to,
      days: nights.map((night) => {
        const booking = occupied.get(night);
        if (booking) {
          return {
            night,
            status: 'BOOKED',
            bookingId: booking.bookingId,
            reference: booking.reference,
            bookingStatus: booking.status,
          };
        }
        const blocked = room.blocked.some((r) => r.from <= night && night < r.to);
        if (blocked) return { night, status: 'BLOCKED' };
        const offered = room.active && room.availability.some((r) => r.from <= night && night < r.to);
        return { night, status: offered ? 'AVAILABLE' : 'NOT_AVAILABLE' };
      }),
    };
  }
}
