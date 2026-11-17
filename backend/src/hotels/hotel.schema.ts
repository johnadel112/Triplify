import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongoSchema, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'hotels' })
export class Hotel {
  @Prop({ type: MongoSchema.Types.ObjectId, ref: 'User' })
  moderatorId?: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, maxlength: 100 })
  name!: string;

  @Prop({ type: String, required: true, maxlength: 3000 })
  description!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 100 })
  city!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 100 })
  country!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  address!: string;

  @Prop({ type: Number, required: true, min: 1, max: 5 })
  starClass!: number;

  @Prop({ type: [String], default: [] })
  amenities!: string[];

  @Prop({ type: [String], default: [] })
  images!: string[];

  @Prop({ type: Boolean, default: true })
  active!: boolean;

  @Prop({ type: Number, default: 0, min: 0, max: 5 })
  rating!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  reviewCount!: number;

  @Prop({ type: String, required: true })
  timeZone!: string;

  @Prop({ type: String, default: '14:00' })
  checkInTime!: string;

  @Prop({ type: String, default: '11:00' })
  checkOutTime!: string;

  @Prop({
    type: [
      {
        daysBefore: { type: Number, required: true, min: 0 },
        refundPercentage: { type: Number, required: true, min: 0, max: 100 },
        _id: false,
      },
    ],
    default: [],
  })
  cancellationTiers!: { daysBefore: number; refundPercentage: number }[];

  createdAt!: Date;
  updatedAt!: Date;
}

export type HotelDocument = HydratedDocument<Hotel>;
export const HotelSchema = SchemaFactory.createForClass(Hotel);
HotelSchema.index({ city: 1, country: 1, active: 1 });
