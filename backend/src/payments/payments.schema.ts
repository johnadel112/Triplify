import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BookingType, PaymentStatus, PLATFORM_CURRENCY, RefundStatus } from './payments.constants';

@Schema({ timestamps: true })
export class Payment extends Document {
  @Prop({ required: true, index: true })
  bookingId!: string;

  @Prop({ required: true, enum: Object.values(BookingType) })
  bookingType!: BookingType;

  @Prop({ required: true, index: true, type: Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  amount!: number;

  @Prop({ required: true, default: PLATFORM_CURRENCY })
  currency!: string;

  @Prop({ required: true, index: true })
  stripePaymentIntentId!: string;

  @Prop({ required: true })
  stripeClientSecret!: string;

  @Prop({
    required: true,
    enum: Object.values(PaymentStatus),
    default: PaymentStatus.PENDING,
    index: true,
  })
  status!: PaymentStatus;

  @Prop({ default: 0 })
  retryCount!: number;

  @Prop({ default: false })
  policyAccepted!: boolean;

  @Prop()
  policyAcceptedAt?: Date;

  @Prop()
  transactionId?: string;

  @Prop()
  errorMessage?: string;

  @Prop({ default: Date.now })
  createdAt!: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

@Schema({ timestamps: true })
export class PolicyAcceptance extends Document {
  @Prop({ required: true, index: true })
  bookingId!: string;

  @Prop({ required: true, enum: Object.values(BookingType) })
  bookingType!: BookingType;

  @Prop({ required: true, index: true, type: Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  accepted!: boolean;

  @Prop({ required: true, default: Date.now })
  acceptedAt!: Date;

  @Prop({ type: Object })
  snapshotPolicies?: Record<string, unknown>;
}

export const PolicyAcceptanceSchema = SchemaFactory.createForClass(PolicyAcceptance);
PolicyAcceptanceSchema.index({ bookingId: 1, userId: 1 });

@Schema({ timestamps: true })
export class Refund extends Document {
  @Prop({ required: true, index: true })
  paymentId!: string;

  @Prop({ required: true, index: true })
  bookingId!: string;

  @Prop({ required: true, enum: Object.values(BookingType) })
  bookingType!: BookingType;

  @Prop({ required: true, index: true, type: Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  amount!: number;

  @Prop({ required: true, default: PLATFORM_CURRENCY })
  currency!: string;

  @Prop({ required: true })
  stripeRefundId!: string;

  @Prop({ required: true, enum: ['USER_CANCELLATION', 'PROVIDER_CANCELLATION'] })
  reason!: 'USER_CANCELLATION' | 'PROVIDER_CANCELLATION';

  @Prop({ required: true, min: 0, max: 100 })
  refundPercentage!: number;

  @Prop({
    required: true,
    enum: Object.values(RefundStatus),
    default: RefundStatus.SUCCEEDED,
  })
  status!: RefundStatus;

  @Prop({ default: Date.now })
  createdAt!: Date;
}

export const RefundSchema = SchemaFactory.createForClass(Refund);

