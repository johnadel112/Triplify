import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
@Schema({ timestamps: true })
export class AuditLog {
  @Prop({ required: true, index: true }) actorId!: string;
  @Prop({ required: true }) action!: string;
  @Prop({ required: true }) targetId!: string;
  @Prop({ required: true }) targetType!: string;
  @Prop() beforeStatus?: string;
  @Prop() afterStatus?: string;
  @Prop({ required: true, enum: ['SUCCESS', 'DENIED'] }) outcome!: string;
  @Prop({ required: true }) occurredAt!: Date;
}
export const AuditSchema = SchemaFactory.createForClass(AuditLog);
@Schema({ timestamps: true })
export class NotificationOutbox {
  @Prop({ required: true, unique: true }) eventId!: string;
  @Prop({ required: true }) actorId!: string;
  @Prop({ required: true }) action!: string;
  @Prop({ required: true }) targetId!: string;
  @Prop({ required: true }) targetType!: string;
  @Prop() status?: string;
  @Prop({ required: true }) occurredAt!: Date;
  @Prop({ default: 'PENDING', enum: ['PENDING', 'DELIVERED'] }) deliveryStatus!: string;
}
export const NotificationOutboxSchema = SchemaFactory.createForClass(NotificationOutbox);
