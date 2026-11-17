import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { REVIEW_MAX_LENGTH } from './hotel-bookings.constants';

/** HTL-23: one rating (1-5) with optional text per completed reservation. */
@Schema({ timestamps: true, collection: 'hotel_reviews' })
export class Review {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) bookingId!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) hotelId!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;
  @Prop({ required: true, min: 1, max: 5 }) rating!: number;
  @Prop({ trim: true, maxlength: REVIEW_MAX_LENGTH }) text?: string;
  /** GEN-10: hidden by an administrator after a report. */
  @Prop({ default: false }) hidden!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}
export type ReviewDocument = HydratedDocument<Review>;
export const ReviewSchema = SchemaFactory.createForClass(Review);
ReviewSchema.index({ bookingId: 1 }, { unique: true });
ReviewSchema.index({ hotelId: 1, hidden: 1, createdAt: -1 });
