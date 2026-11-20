import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true })
export class MailJob {
  @Prop({ required: true, unique: true }) key!: string;
  @Prop({ required: true, select: false }) payload!: string;
  @Prop({ default: 'PENDING', enum: ['PENDING', 'SENT', 'FAILED', 'SKIPPED'] }) status!: string;
  @Prop({ default: 0 }) attempts!: number;
  @Prop({ default: Date.now }) nextAttemptAt!: Date;
  @Prop() leaseUntil?: Date;
  @Prop() leaseId?: string;
  @Prop() sentAt?: Date;
  @Prop({ required: true }) expiresAt!: Date;
}
export const MailJobSchema = SchemaFactory.createForClass(MailJob);
MailJobSchema.index({ status: 1, nextAttemptAt: 1 });
MailJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
