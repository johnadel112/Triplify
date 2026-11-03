import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum NotificationType {
  BOOKING_CONFIRMED = 'BOOKING_CONFIRMED',
  BOOKING_CANCELLED = 'BOOKING_CANCELLED',
  REFUND_ISSUED = 'REFUND_ISSUED',
  FLIGHT_SCHEDULE_CHANGED = 'FLIGHT_SCHEDULE_CHANGED',
  ACCOUNT_STATUS_CHANGED = 'ACCOUNT_STATUS_CHANGED',
  PROVIDER_STATUS_CHANGED = 'PROVIDER_STATUS_CHANGED',
  REPORT_RESOLVED = 'REPORT_RESOLVED',
  GENERAL = 'GENERAL',
}

@Schema({ timestamps: true })
export class Notification extends Document {
  @Prop({ required: true, index: true, type: Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  message!: string;

  @Prop({
    required: true,
    enum: Object.values(NotificationType),
    default: NotificationType.GENERAL,
  })
  type!: NotificationType;

  @Prop({ default: false, index: true })
  read!: boolean;

  @Prop()
  readAt?: Date;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop({ default: Date.now })
  createdAt!: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

