import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongoSchema, Types } from 'mongoose';

@Schema({ timestamps: true })
export class AirlineProfile extends Document {
  /** Set when the assigned moderator first manages the profile; an admin creates airlines first (FLT-01). */
  @Prop({ type: MongoSchema.Types.ObjectId, ref: 'User' })
  moderatorId?: Types.ObjectId;

  @Prop({ type: String, required: true })
  name!: string;

  /** FLT-01: two-character airline code, unique when set. */
  @Prop({ type: String })
  code?: string;

  @Prop({ type: String })
  logoUrl?: string;

  @Prop({ type: String })
  contactEmail?: string;

  /** FLT-08: price per extra bag and maximum extra bags per passenger. */
  @Prop({
    type: { extraBagPrice: Number, maxExtraBagsPerPassenger: Number, _id: false },
  })
  baggagePolicy?: { extraBagPrice: number; maxExtraBagsPerPassenger: number };

  /** FLT-09: days-before-departure thresholds with refund percentages. */
  @Prop({ type: [{ daysBefore: Number, refundPercentage: Number, _id: false }], default: [] })
  cancellationTiers!: { daysBefore: number; refundPercentage: number }[];

  @Prop({ type: Boolean, default: true, index: true })
  verified!: boolean;

  @Prop({ type: Boolean, default: true, index: true })
  active!: boolean;

  @Prop({ type: Number, default: 0, select: false })
  bookingRevision!: number;
}

@Schema({ timestamps: true })
export class Flight extends Document {
  @Prop({ type: Object, default: {} }) seatMaps!: Record<string, string[]>;
  @Prop({ type: [{ seat: String, cabinClass: String, bookingId: MongoSchema.Types.ObjectId, _id: false }], default: [], select: false })
  seatAssignments!: { seat: string; cabinClass: string; bookingId: Types.ObjectId }[];
  @Prop({ type: String, required: true })
  flightNumber!: string;

  @Prop({ type: MongoSchema.Types.ObjectId, ref: 'AirlineProfile', required: true })
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

  // { economy: { seatCount, price, freeBags, maxBagWeightKg }, premiumEconomy: {...}, ... }
  @Prop({ type: Object, required: true })
  cabins!: Record<
    string,
    { seatCount: number; price: number; freeBags?: number; maxBagWeightKg?: number }
  >;

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
AirlineProfileSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { code: { $type: 'string' } }, name: 'code_unique_when_set' },
);
// One airline per moderator, enforced only once a moderator is linked. A new index name avoids a
// startup conflict with the legacy non-partial `moderatorId_1` index; drop that one with
// `npm run migrate:airline-moderator-index -- --apply`.
AirlineProfileSchema.index(
  { moderatorId: 1 },
  {
    unique: true,
    name: 'moderatorId_unique_when_linked',
    partialFilterExpression: { moderatorId: { $type: 'objectId' } },
  },
);
export const FlightSchema = SchemaFactory.createForClass(Flight);
