import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class AirlineProfile extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
 feature/FLT-19-flight-booking
  moderatorId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String })
  logoUrl?: string;

  @Prop({ type: String })
  contactEmail?: string;
=======
  moderatorId: Types.ObjectId | undefined;

  @Prop({ required: true })
  name: string | undefined;

  @Prop()
  logoUrl: string | undefined;

  @Prop()
  contactEmail: string | undefined;
 feature/john-auth-admin
}

@Schema({ timestamps: true })
export class Flight extends Document {
feature/FLT-19-flight-booking
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

  @Prop({ required: true })
  flightNumber: string | undefined;

  @Prop({ type: Types.ObjectId, ref: 'AirlineProfile', required: true })
  airlineId: Types.ObjectId | undefined;

  @Prop({ required: true })
  departureAirport: string | undefined; // IATA code

  @Prop({ required: true })
  arrivalAirport: string | undefined; // IATA code

  @Prop({ required: true })
  departureTimeUtc: Date | undefined;

  @Prop({ required: true })
  arrivalTimeUtc: Date | undefined;

  @Prop({ required: true })
  departureDate: string | undefined; // YYYY-MM-DD

  @Prop({
    type: {
      economy: { seatCount: { type: Number, min: 1 }, price: Number },
      premiumEconomy: { seatCount: { type: Number, min: 1 }, price: Number },
      business: { seatCount: { type: Number, min: 1 }, price: Number },
      first: { seatCount: { type: Number, min: 1 }, price: Number },
    },
    required: true,
  })
  cabins: Record<string, { seatCount: number; price: number; }> | undefined;

  @Prop({ required: true, default: 0 })
  extraBaggagePricePerKg: number | undefined;
 feature/john-auth-admin

  @Prop({
    type: [{ hoursBeforeDeparture: Number, refundPercentage: Number }],
    default: [],
  })
 feature/FLT-19-flight-booking
  cancellationTiers!: { hoursBeforeDeparture: number; refundPercentage: number }[];

  cancellationTiers: { hoursBeforeDeparture: number; refundPercentage: number; }[] | undefined;
 feature/john-auth-admin

  @Prop({
    type: String,
    enum: ['SCHEDULED', 'DEPARTED', 'ARRIVED', 'CANCELLED', 'DELAYED'],
    default: 'SCHEDULED',
  })
 feature/FLT-19-flight-booking
  status!: string;

  @Prop({ type: Boolean, default: false })
  hasConfirmedBookings!: boolean;

  status: string | undefined;

  @Prop({ type: Boolean, default: false })
  hasConfirmedBookings: boolean | undefined;
 feature/john-auth-admin
}

export const AirlineProfileSchema = SchemaFactory.createForClass(AirlineProfile);
export const FlightSchema = SchemaFactory.createForClass(Flight);