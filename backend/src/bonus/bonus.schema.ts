import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongoSchema, Types } from 'mongoose';
@Schema({ timestamps: true })
export class Favourite {
  @Prop({ type: MongoSchema.Types.ObjectId, required: true }) userId!: Types.ObjectId;
  @Prop({ required: true, enum: ['HOTEL', 'FLIGHT', 'ITINERARY', 'BLOG_POST'] }) type!: string;
  @Prop({ type: MongoSchema.Types.ObjectId, required: true }) targetId!: Types.ObjectId;
  createdAt!: Date;
}
export const FavouriteSchema = SchemaFactory.createForClass(Favourite);
FavouriteSchema.index({ userId: 1, type: 1, targetId: 1 }, { unique: true });
@Schema({ timestamps: true })
export class BookingAttachment {
  @Prop({ type: MongoSchema.Types.ObjectId, required: true }) itineraryId!: Types.ObjectId;
  @Prop({ type: MongoSchema.Types.ObjectId, required: true }) userId!: Types.ObjectId;
  @Prop({ required: true, enum: ['FLIGHT', 'HOTEL'] }) type!: string;
  @Prop({ type: MongoSchema.Types.ObjectId, required: true }) bookingId!: Types.ObjectId;
}
export const BookingAttachmentSchema = SchemaFactory.createForClass(BookingAttachment);
BookingAttachmentSchema.index({ itineraryId: 1, type: 1, bookingId: 1 }, { unique: true });
