import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export interface RoomNightRange {
  from: string; // Inclusive hotel-local date YYYY-MM-DD
  to: string;   // Exclusive hotel-local date YYYY-MM-DD
}

const rangeSchema = {
  from: { type: String, required: true },
  to: { type: String, required: true },
  _id: false,
};

/** A room is one uniquely bookable physical unit, NOT a count of identical rooms. */
@Schema({ timestamps: true, collection: 'hotel_rooms' })
export class Room {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Hotel', required: true, index: true })
  hotelId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, maxlength: 100 })
  name!: string;

  // Normalized identity fields prevent case/spacing duplicates within each hotel.
  @Prop({ type: String, required: true, select: false })
  nameKey!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 40 })
  number!: string;

  @Prop({ type: String, required: true, select: false })
  numberKey!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 100 })
  type!: string;

  @Prop({ type: Number, required: true, min: 1, max: 20 })
  beds!: number;

  @Prop({ type: Number, required: true, min: 1, max: 30 })
  maxOccupancy!: number;

  // Current nightly price in the platform currency; bookings snapshot agreed prices.
  @Prop({ type: Number, required: true, min: 0.01 })
  pricePerNight!: number;

  @Prop({ type: Boolean, default: true })
  active!: boolean;

  // Populated by the availability/blocked-date batch. Do not edit via room profile DTOs.
  @Prop({ type: [rangeSchema], default: [] })
  availability!: RoomNightRange[];

  @Prop({ type: [rangeSchema], default: [] })
  blocked!: RoomNightRange[];

  createdAt!: Date;
  updatedAt!: Date;
}

export type RoomDocument = HydratedDocument<Room>;
export const RoomSchema = SchemaFactory.createForClass(Room);
RoomSchema.index({ hotelId: 1, nameKey: 1 }, { unique: true });
RoomSchema.index({ hotelId: 1, numberKey: 1 }, { unique: true });
RoomSchema.index({ hotelId: 1, active: 1 });
