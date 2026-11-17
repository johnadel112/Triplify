import { ServiceUnavailableException } from '@nestjs/common';
import { ClientSession } from 'mongoose';
import { CancellationTier } from '../payments/refunds.service';

/**
 * Integration contract between hotel bookings (Youssef: HTL-16..24) and hotel/room
 * management (Magdy: HTL-01..15). Bookings never write hotel or room documents; they read
 * a snapshot through this port and keep their own reservation and room-night records.
 *
 * Date conventions: dates are hotel-local calendar dates `YYYY-MM-DD`. A range describes
 * NIGHTS: `from` is inclusive and `to` is exclusive (like check-in / check-out), so the range
 * { from: '2026-12-01', to: '2026-12-04' } covers the nights of Dec 1, 2 and 3.
 */
export const HOTEL_INVENTORY = Symbol('HOTEL_INVENTORY');

export interface NightRange {
  from: string;
  to: string;
}

export interface HotelInventorySnapshot {
  id: string;
  name: string;
  /** false when the hotel is deactivated by an admin (ACC-15): not bookable. */
  active: boolean;
  /** IANA time zone of the hotel's city (reference data City.timeZone). */
  timeZone: string;
  /** HTL-09, 24h `HH:mm` hotel-local times. */
  checkInTime: string;
  checkOutTime: string;
  /** HTL-10 tiers: unique daysBefore (>= 0) with refundPercentage 0..100. */
  cancellationTiers: CancellationTier[];
}

export interface RoomInventorySnapshot {
  id: string;
  hotelId: string;
  name: string;
  type: string;
  beds: number;
  maxOccupancy: number;
  /** Current price per night in the platform currency (PAY-04). */
  pricePerNight: number;
  /** false when the room is deactivated (HTL-06). */
  active: boolean;
  /** HTL-04 non-overlapping bookable ranges. */
  availability: NightRange[];
  /** HTL-06 blocked ranges. */
  blocked: NightRange[];
}

export interface HotelInventoryPort {
  /** Returns null for an unknown hotel. Read inside `session` when one is supplied. */
  getHotel(hotelId: string, session?: ClientSession): Promise<HotelInventorySnapshot | null>;
  /** Returns the requested rooms that exist; unknown IDs are simply omitted. */
  getRooms(
    hotelId: string,
    roomIds: string[],
    session?: ClientSession,
  ): Promise<RoomInventorySnapshot[]>;
}

const unavailable = (): never => {
  throw new ServiceUnavailableException({
    code: 'INTEGRATION_UNAVAILABLE',
    message: 'Hotel inventory integration is not configured',
  });
};

/**
 * Team convention (docs/TEAM_INTEGRATION.md): until the owning module exports a real adapter,
 * the default fails with 503 instead of inventing hotels or rooms.
 */
export const unavailableHotelInventory: HotelInventoryPort = {
  getHotel: unavailable,
  getRooms: unavailable,
};
