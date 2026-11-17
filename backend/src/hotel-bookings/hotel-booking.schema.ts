import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { PLATFORM_CURRENCY } from '../payments/payments.constants';
import { HotelBookingStatus } from './hotel-bookings.constants';

/** One individually bookable room inside a reservation, with its own guests (HTL-16). */
@Schema({ _id: false })
export class BookedRoom {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) roomId!: Types.ObjectId;
  @Prop({ required: true }) roomName!: string;
  @Prop({ required: true }) roomType!: string;
  @Prop({ required: true, min: 0 }) beds!: number;
  @Prop({ required: true, min: 1 }) maxOccupancy!: number;
  /** Price agreed at booking time; later room price edits do not change it (HTL-05). */
  @Prop({ required: true, min: 0 }) pricePerNightCents!: number;
  @Prop({ required: true, min: 0 }) subtotalCents!: number;
  @Prop({ required: true, min: 1 }) adults!: number;
  @Prop({ type: [Number], default: [] }) childrenAges!: number[];
}
const BookedRoomSchema = SchemaFactory.createForClass(BookedRoom);

@Schema({ _id: false })
export class PolicySnapshot {
  @Prop({ required: true }) checkInTime!: string;
  @Prop({ required: true }) checkOutTime!: string;
  @Prop({
    type: [{ daysBefore: Number, refundPercentage: Number, _id: false }],
    default: [],
  })
  cancellationTiers!: { daysBefore: number; refundPercentage: number }[];
}
const PolicySnapshotSchema = SchemaFactory.createForClass(PolicySnapshot);

@Schema({ _id: false })
export class CancellationRecord {
  @Prop({ required: true }) daysBefore!: number;
  @Prop({ required: true, min: 0, max: 100 }) refundPercentage!: number;
  @Prop({ required: true, min: 0 }) refundAmountCents!: number;
  @Prop({ required: true, enum: ['NOT_APPLICABLE', 'PENDING', 'SUCCEEDED', 'FAILED'] })
  refundStatus!: 'NOT_APPLICABLE' | 'PENDING' | 'SUCCEEDED' | 'FAILED';
  @Prop() refundId?: string;
  @Prop({ required: true, enum: ['USER', 'SYSTEM'] }) cancelledBy!: 'USER' | 'SYSTEM';
}
const CancellationRecordSchema = SchemaFactory.createForClass(CancellationRecord);

@Schema({ timestamps: true, collection: 'hotel_bookings' })
export class HotelBooking {
  /** HTL-17: generated only when the reservation is confirmed. */
  @Prop() reference?: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;
  /** The hotel. Named providerId/providerType so AccessPolicy.bookingQuery scopes moderators. */
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) providerId!: Types.ObjectId;
  @Prop({ type: String, enum: ['HOTEL'], default: 'HOTEL', required: true })
  providerType!: 'HOTEL';
  @Prop({ required: true }) hotelName!: string;
  @Prop({ required: true }) timeZone!: string;
  /** Hotel-local calendar dates. */
  @Prop({ required: true }) checkInDate!: string;
  @Prop({ required: true }) checkOutDate!: string;
  /** UTC instants derived from local dates + check-in/out times in the hotel time zone. */
  @Prop({ required: true }) checkInAt!: Date;
  @Prop({ required: true }) checkOutAt!: Date;
  @Prop({ required: true, min: 1 }) nights!: number;
  @Prop({ type: [BookedRoomSchema], required: true }) rooms!: BookedRoom[];
  @Prop({ required: true, min: 0 }) totalAmountCents!: number;
  @Prop({ required: true, default: PLATFORM_CURRENCY }) currency!: string;
  @Prop({ type: String, enum: HotelBookingStatus, required: true })
  status!: HotelBookingStatus;
  @Prop() holdExpiresAt?: Date;
  @Prop({ type: PolicySnapshotSchema, required: true }) policy!: PolicySnapshot;
  @Prop() paymentId?: string;
  @Prop() confirmedAt?: Date;
  @Prop() completedAt?: Date;
  @Prop() cancelledAt?: Date;
  @Prop() expiredAt?: Date;
  @Prop({ type: CancellationRecordSchema }) cancellation?: CancellationRecord;
  createdAt!: Date;
  updatedAt!: Date;
}
export type HotelBookingDocument = HydratedDocument<HotelBooking>;
export const HotelBookingSchema = SchemaFactory.createForClass(HotelBooking);
HotelBookingSchema.index(
  { reference: 1 },
  { unique: true, partialFilterExpression: { reference: { $type: 'string' } } },
);
HotelBookingSchema.index({ userId: 1, status: 1, checkInAt: 1 });
HotelBookingSchema.index({ providerId: 1, checkInAt: 1 });
HotelBookingSchema.index({ status: 1, holdExpiresAt: 1 });
HotelBookingSchema.index({ status: 1, checkOutAt: 1 });

/**
 * Concurrency guard (HTL-18, critical requirement): one document per (room, night) claimed by a
 * PENDING_PAYMENT or CONFIRMED reservation. The unique index makes MongoDB itself reject a second
 * claim, so two concurrent requests can never both hold the same room for an overlapping night.
 * `expiresAt` is set while the hold is pending and removed on confirmation.
 */
@Schema({ collection: 'hotel_room_nights' })
export class RoomNightLock {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) roomId!: Types.ObjectId;
  @Prop({ required: true }) night!: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) bookingId!: Types.ObjectId;
  @Prop() expiresAt?: Date;
}
export type RoomNightLockDocument = HydratedDocument<RoomNightLock>;
export const RoomNightLockSchema = SchemaFactory.createForClass(RoomNightLock);
RoomNightLockSchema.index({ roomId: 1, night: 1 }, { unique: true });
RoomNightLockSchema.index({ bookingId: 1 });
