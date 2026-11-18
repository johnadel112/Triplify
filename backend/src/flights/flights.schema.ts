import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class AirlineProfile extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  moderatorId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String })
  logoUrl?: string;

  @Prop({ type: String })
  contactEmail?: string;
}

@Schema({ timestamps: true })
export class Flight extends Document {
  @Prop({ type: String, required: true })
  flightNumber!: string;

  @Prop({ type: Types.ObjectId, ref: 'AirlineProfile', required: true })
  airlineId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  departureAirport!: string; // IATA code

  @Prop({ type: String, required: true })
  arrivalAirport!: string; // IATA code

  @Prop({ type: Date, required: true })
  departureTimeUtc!: Date;

  @Prop({ type: Date, required: true })
  arrivalTimeUtc!: Date;

  @Prop({ type: String, required: true })
  departureDate!: string; // YYYY-MM-DD

  // { economy: { seatCount, price }, premiumEconomy: {...}, business: {...}, first: {...} }
  @Prop({ type: Object, required: true })
  cabins!: Record<string, { seatCount: number; price: number }>;

  @Prop({ type: Number, required: true, default: 0 })
  extraBaggagePricePerKg!: number;

  @Prop({
    type: [{ hoursBeforeDeparture: Number, refundPercentage: Number }],
    default: [],
  })
  cancellationTiers!: { hoursBeforeDeparture: number; refundPercentage: number }[];

  @Prop({
    type: String,
    enum: ['SCHEDULED', 'DEPARTED', 'ARRIVED', 'CANCELLED', 'DELAYED'],
    default: 'SCHEDULED',
  })
  status!: string;

  @Prop({ type: Boolean, default: false })
  hasConfirmedBookings!: boolean;
}

export const AirlineProfileSchema = SchemaFactory.createForClass(AirlineProfile);
export const FlightSchema = SchemaFactory.createForClass(Flight);