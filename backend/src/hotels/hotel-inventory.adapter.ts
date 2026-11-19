import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types, isValidObjectId } from 'mongoose';
import {
  HotelInventoryPort,
  HotelInventorySnapshot,
  RoomInventorySnapshot,
} from '../hotel-bookings/hotel-inventory.port';
import { Hotel } from './hotel.schema';
import { Room } from './room.schema';

/**
 * Read-only implementation of Youssef's already-defined inventory contract.
 * Hotel bookings can import HotelsModule and useExisting: HotelInventoryAdapter.
 * Do not change existing bookings or reservation price snapshots here.
 */
@Injectable()
export class HotelInventoryAdapter implements HotelInventoryPort {
  constructor(
    @InjectModel(Hotel.name) private readonly hotels: Model<Hotel>,
    @InjectModel(Room.name) private readonly rooms: Model<Room>,
  ) {}

  async getHotel(hotelId: string, session?: ClientSession): Promise<HotelInventorySnapshot | null> {
    if (!isValidObjectId(hotelId)) return null;
    const query = this.hotels.findById(hotelId)
      .select('name active verified timeZone checkInTime checkOutTime cancellationTiers');
    if (session) query.session(session);
    const hotel = await query.lean();
    if (!hotel) return null;
    return {
      id: String(hotel._id),
      name: hotel.name,
      active: hotel.active && hotel.verified,
      timeZone: hotel.timeZone,
      checkInTime: hotel.checkInTime,
      checkOutTime: hotel.checkOutTime,
      cancellationTiers: hotel.cancellationTiers.map((tier) => ({
        daysBefore: tier.daysBefore,
        refundPercentage: tier.refundPercentage,
      })),
    };
  }

  async coordinateConfirmation(hotelId: string, session: ClientSession) {
    if (!isValidObjectId(hotelId)) return false;
    const result = await this.hotels.updateOne(
      { _id: new Types.ObjectId(hotelId), active: true, verified: true },
      { $inc: { bookingRevision: 1 } },
      { session },
    );
    return result.modifiedCount === 1;
  }

  async getRooms(
    hotelId: string,
    roomIds: string[],
    session?: ClientSession,
  ): Promise<RoomInventorySnapshot[]> {
    if (!isValidObjectId(hotelId) || !roomIds.length) return [];
    const validRoomIds = roomIds.filter(isValidObjectId);
    if (!validRoomIds.length) return [];
    const query = this.rooms.find({
      hotelId: new Types.ObjectId(hotelId),
      _id: { $in: validRoomIds.map((id) => new Types.ObjectId(id)) },
    }).select('hotelId name type beds maxOccupancy pricePerNight active availability blocked');
    if (session) query.session(session);
    const rooms = await query.lean();
    return rooms.map((room) => ({
      id: String(room._id),
      hotelId: String(room.hotelId),
      name: room.name,
      type: room.type,
      beds: room.beds,
      maxOccupancy: room.maxOccupancy,
      pricePerNight: room.pricePerNight,
      active: room.active,
      availability: room.availability.map((range) => ({ from: range.from, to: range.to })),
      blocked: room.blocked.map((range) => ({ from: range.from, to: range.to })),
    }));
  }
}
