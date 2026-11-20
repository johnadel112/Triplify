import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongoSchema, Types } from 'mongoose';

export type BookingStatus = 'DRAFT' | 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';
export const CABIN_KEYS = ['economy', 'premiumEconomy', 'business', 'first'] as const;
export type CabinKey = (typeof CABIN_KEYS)[number];

@Schema({ _id: false })
export class PassengerEntry {
  @Prop({ type: String, required: true }) firstName!: string;
  @Prop({ type: String, required: true }) lastName!: string;
  @Prop({ type: Date, required: true }) dateOfBirth!: Date;
  @Prop({ type: String, required: true }) passportNumber!: string;
  @Prop({ type: String, required: true, enum: ['adult', 'child', 'infant'] }) type!: string;
  @Prop({ type: Number, default: 0, min: 0 }) extraBaggageKg!: number;
  /** FLT-19: extra bags beyond the cabin's free allowance (FLT-08 pricing). */
  @Prop({ type: Number, default: 0, min: 0 }) extraBags!: number;
}
const PassengerEntrySchema = SchemaFactory.createForClass(PassengerEntry);

@Schema({ _id: false })
export class BookingLeg {
  @Prop({ type: [String], default: [] }) selectedSeats?: string[];
  @Prop({ type: MongoSchema.Types.ObjectId, required: true }) flightId!: Types.ObjectId;
  @Prop({ type: String, required: true }) flightNumber!: string;
  @Prop({ type: String, required: true }) cabinClass!: string; // economy | premiumEconomy | business | first
  @Prop({ type: String, required: true }) departureAirport!: string;
  @Prop({ type: String, required: true }) arrivalAirport!: string;
  @Prop({ type: Date, required: true }) departureTime!: Date; // UTC
  @Prop({ type: Date, required: true }) arrivalTime!: Date; // UTC
  @Prop({ type: Number, required: true }) farePerSeat!: number;
  @Prop({ type: Number, required: true }) baggageCost!: number;
  @Prop({ type: Number, required: true }) legTotal!: number;
}
const BookingLegSchema = SchemaFactory.createForClass(BookingLeg);

@Schema({ collection: 'flight_bookings', timestamps: true })
export class FlightBooking {
  @Prop({ type: MongoSchema.Types.ObjectId, required: true, index: true }) userId!: Types.ObjectId;
  @Prop({ type: String, required: true, unique: true }) reference!: string;
  @Prop({ type: String, required: true, default: 'DRAFT', index: true }) status!: BookingStatus;
  @Prop({ type: [BookingLegSchema], required: true }) legs!: BookingLeg[];
  @Prop({ type: [PassengerEntrySchema], required: true }) passengers!: PassengerEntry[];
  @Prop({ type: Number, required: true }) seatCount!: number;
  @Prop({ type: String, required: true }) currency!: string;
  @Prop({ type: Number, required: true }) totalPrice!: number;
  @Prop({ type: Date, required: true }) firstDeparture!: Date;
  @Prop({ type: Date, required: true }) lastDeparture!: Date;
  // snapshot of the airline cancellation tiers at booking time
  @Prop({ type: [{ hoursBeforeDeparture: Number, refundPercentage: Number, _id: false }], default: [] })
  cancellationPolicy!: { hoursBeforeDeparture: number; refundPercentage: number }[];
  @Prop({ type: Date }) holdExpiresAt?: Date;
  @Prop({ type: MongoSchema.Types.ObjectId }) paymentId?: Types.ObjectId;
  @Prop({ type: Date }) confirmedAt?: Date;
  @Prop({ type: Date }) cancelledAt?: Date;
  @Prop({ type: Number }) refundAmount?: number;
  /** FLT-04/FLT-08 baggage terms agreed at booking time (shown before payment, PAY-02). */
  @Prop({ type: Object }) baggagePolicy?: {
    extraBagPrice?: number;
    maxExtraBagsPerPassenger?: number;
    legs: { flightId: string; cabinClass: string; freeBags?: number; maxBagWeightKg?: number }[];
  };
  /** FLT-06: PROVIDER when the airline cancelled the flight (refunded in full). */
  @Prop({ type: String, enum: ['USER', 'PROVIDER'] }) cancelledBy?: 'USER' | 'PROVIDER';
  @Prop({ enum: ['NOT_APPLICABLE', 'PENDING', 'SUCCEEDED', 'FAILED'] }) refundStatus?: string;
  @Prop() refundId?: string;
}
export const FlightBookingSchema = SchemaFactory.createForClass(FlightBooking);
FlightBookingSchema.index({ status: 1, holdExpiresAt: 1 });
