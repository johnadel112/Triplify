import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Principal, UserRole } from '../common/domain';
import { HotelBooking } from '../hotel-bookings/hotel-booking.schema';
import { HotelBookingStatus } from '../hotel-bookings/hotel-bookings.constants';
import { Hotel } from './hotel.schema';
import { CreateRoomDto, SetRoomStatusDto, UpdateRoomDto } from './room.dto';
import { Room } from './room.schema';
import { ReplaceRoomRangesDto } from './room-availability.dto';
import { fullyCovered, hotelToday, rangesOverlap, validateNightRanges } from './hotel-ranges';

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
const PUBLIC_ROOM_FIELDS = '-nameKey -numberKey -__v';
const PROTECTED_BOOKING_STATUSES = [HotelBookingStatus.PENDING_PAYMENT, HotelBookingStatus.CONFIRMED];

@Injectable()
export class RoomsService {
  constructor(
    @InjectModel(Room.name) private readonly rooms: Model<Room>,
    @InjectModel(Hotel.name) private readonly hotels: Model<Hotel>,
    @InjectModel(HotelBooking.name) private readonly bookings: Model<HotelBooking>,
  ) {}

  private assertModerator(actor: Principal, hotelId: string) {
    if (
      actor.role !== UserRole.HOTEL_MODERATOR ||
      actor.providerType !== 'HOTEL' ||
      !actor.providerId ||
      actor.providerId.toLowerCase() !== hotelId.toLowerCase()
    ) {
      throw new ForbiddenException('You can only manage rooms for your assigned hotel');
    }
  }

  private async requireHotel(hotelId: string, activeOnly = true) {
    const hotel = await this.hotels.findOne({
      _id: hotelId,
      ...(activeOnly ? { active: true, verified: true } : {}),
    }).select('_id timeZone').lean();
    if (!hotel) throw new NotFoundException('Hotel not found');
    return hotel;
  }

  private async requireRoom(hotelId: string, roomId: string) {
    const room = await this.rooms.findOne({ _id: roomId, hotelId }).exec();
    if (!room) throw new NotFoundException('Room not found in this hotel');
    return room;
  }

  private translateDuplicate(error: unknown): never {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      throw new ConflictException('Room number or name already exists in this hotel');
    }
    throw error;
  }

  /** HTL-03: A room is one bookable physical unit, not a quantity of units. */
  async create(hotelId: string, dto: CreateRoomDto, actor: Principal) {
    this.assertModerator(actor, hotelId);
    await this.requireHotel(hotelId);
    try {
      const room = await this.rooms.create({
        hotelId: new Types.ObjectId(hotelId),
        ...dto,
        nameKey: normalize(dto.name),
        numberKey: normalize(dto.number),
        active: true,
        availability: [],
        blocked: [],
      });
      return this.getForModerator(hotelId, String(room._id), actor);
    } catch (error) {
      this.translateDuplicate(error);
    }
  }

  /** GEN-05: room lists are paginated 10 per page. */
  private async roomPage(filter: Record<string, unknown>, page: number) {
    const [items, total] = await Promise.all([
      this.rooms.find(filter).select(PUBLIC_ROOM_FIELDS).sort({ numberKey: 1 })
        .skip((page - 1) * 10).limit(10).lean(),
      this.rooms.countDocuments(filter),
    ]);
    return { items, total, page, limit: 10 };
  }

  async listPublic(hotelId: string, page = 1) {
    await this.requireHotel(hotelId);
    return this.roomPage({ hotelId, active: true }, page);
  }

  async getPublic(hotelId: string, roomId: string) {
    await this.requireHotel(hotelId);
    const room = await this.rooms.findOne({ _id: roomId, hotelId, active: true })
      .select(PUBLIC_ROOM_FIELDS).lean();
    if (!room) throw new NotFoundException('Room not found');
    return room;
  }

  async listForModerator(hotelId: string, actor: Principal, page = 1) {
    this.assertModerator(actor, hotelId);
    await this.requireHotel(hotelId, false);
    return this.roomPage({ hotelId }, page);
  }

  async getForModerator(hotelId: string, roomId: string, actor: Principal) {
    this.assertModerator(actor, hotelId);
    const room = await this.rooms.findOne({ hotelId, _id: roomId })
      .select(PUBLIC_ROOM_FIELDS).lean();
    if (!room) throw new NotFoundException('Room not found');
    return room;
  }

  /** HTL-05/06: Changing current price does not change existing booking price snapshots. */
  async update(hotelId: string, roomId: string, dto: UpdateRoomDto, actor: Principal) {
    this.assertModerator(actor, hotelId);
    await this.requireHotel(hotelId);
    await this.requireRoom(hotelId, roomId);
    if (!Object.keys(dto).length) throw new BadRequestException('No room fields provided');
    const changes: Record<string, unknown> = { ...dto };
    if (dto.name !== undefined) changes.nameKey = normalize(dto.name);
    if (dto.number !== undefined) changes.numberKey = normalize(dto.number);
    try {
      const room = await this.rooms.findOneAndUpdate(
        { _id: roomId, hotelId },
        { $set: changes },
        { new: true, runValidators: true },
      ).select(PUBLIC_ROOM_FIELDS).lean();
      if (!room) throw new NotFoundException('Room not found');
      return room;
    } catch (error) {
      this.translateDuplicate(error);
    }
  }

  async setStatus(hotelId: string, roomId: string, dto: SetRoomStatusDto, actor: Principal) {
    this.assertModerator(actor, hotelId);
    await this.requireHotel(hotelId, false);
    const room = await this.requireRoom(hotelId, roomId);
    if (room.active === dto.active) return this.getForModerator(hotelId, roomId, actor);

    if (!dto.active) {
      const reserved = await this.bookings.exists({
        providerId: new Types.ObjectId(hotelId),
        'rooms.roomId': room._id,
        status: { $in: PROTECTED_BOOKING_STATUSES },
      });
      if (reserved) {
        throw new ConflictException('Cannot deactivate a room with pending or confirmed reservations');
      }
    }

    const updated = await this.rooms.findOneAndUpdate(
      { _id: roomId, hotelId },
      { $set: { active: dto.active } },
      { new: true, runValidators: true },
    ).select(PUBLIC_ROOM_FIELDS).lean();
    if (!updated) throw new NotFoundException('Room not found');
    return updated;
  }

  /** HTL-06: delete a room unless a Pending or Confirmed reservation uses it. Past reservations keep their room snapshot. */
  async remove(hotelId: string, roomId: string, actor: Principal) {
    this.assertModerator(actor, hotelId);
    await this.requireHotel(hotelId, false);
    const room = await this.requireRoom(hotelId, roomId);
    const reserved = await this.bookings.exists({
      providerId: new Types.ObjectId(hotelId),
      'rooms.roomId': room._id,
      status: { $in: PROTECTED_BOOKING_STATUSES },
    });
    if (reserved) {
      throw new ConflictException('Cannot delete a room with pending or confirmed reservations');
    }
    await this.rooms.deleteOne({ _id: room._id, hotelId });
    return { deleted: true, roomId };
  }

  /** HTL-04: Replace a room's future availability ranges; no overlaps allowed. */
  async replaceAvailability(
    hotelId: string,
    roomId: string,
    dto: ReplaceRoomRangesDto,
    actor: Principal,
  ) {
    this.assertModerator(actor, hotelId);
    const hotel = await this.requireHotel(hotelId, false);
    await this.requireRoom(hotelId, roomId);
    const ranges = validateNightRanges(dto.ranges);

    // Existing pending/confirmed bookings must retain all their reserved nights.
    const reservations = await this.bookings.find({
      providerId: new Types.ObjectId(hotelId),
      'rooms.roomId': new Types.ObjectId(roomId),
      status: { $in: PROTECTED_BOOKING_STATUSES },
      checkOutDate: { $gt: hotelToday(hotel.timeZone) },
    }).select('checkInDate checkOutDate').lean();

    for (const reservation of reservations) {
      if (!fullyCovered(ranges, reservation.checkInDate, reservation.checkOutDate)) {
        throw new ConflictException(
          `Cannot remove availability for existing reservation nights ${reservation.checkInDate} to ${reservation.checkOutDate}`,
        );
      }
    }

    const updated = await this.rooms.findOneAndUpdate(
      { _id: roomId, hotelId },
      { $set: { availability: ranges } },
      { new: true, runValidators: true },
    ).select(PUBLIC_ROOM_FIELDS).lean();
    if (!updated) throw new NotFoundException('Room not found');
    return updated;
  }

  /** HTL-06/08: A moderator may block unreserved dates only. */
  async replaceBlocked(
    hotelId: string,
    roomId: string,
    dto: ReplaceRoomRangesDto,
    actor: Principal,
  ) {
    this.assertModerator(actor, hotelId);
    await this.requireHotel(hotelId, false);
    await this.requireRoom(hotelId, roomId);
    const ranges = validateNightRanges(dto.ranges);

    if (ranges.length) {
      // Query by date overlap (inclusive start, exclusive end) and the precise physical room.
      const reservations = await this.bookings.find({
        providerId: new Types.ObjectId(hotelId),
        'rooms.roomId': new Types.ObjectId(roomId),
        status: { $in: PROTECTED_BOOKING_STATUSES },
        $or: ranges.map((range) => ({
          checkInDate: { $lt: range.to },
          checkOutDate: { $gt: range.from },
        })),
      }).select('checkInDate checkOutDate').lean();

      for (const booking of reservations) {
        const bookedRange = { from: booking.checkInDate, to: booking.checkOutDate };
        if (ranges.some((range) => rangesOverlap(range, bookedRange))) {
          throw new ConflictException(
            `Cannot block dates occupied by a pending or confirmed reservation (${booking.checkInDate} to ${booking.checkOutDate})`,
          );
        }
      }
    }

    const updated = await this.rooms.findOneAndUpdate(
      { _id: roomId, hotelId },
      { $set: { blocked: ranges } },
      { new: true, runValidators: true },
    ).select(PUBLIC_ROOM_FIELDS).lean();
    if (!updated) throw new NotFoundException('Room not found');
    return updated;
  }
}
