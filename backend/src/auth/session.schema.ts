import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';
@Schema({ timestamps: true })
export class Session {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true }) userId!: Types.ObjectId;
  @Prop({ required: true, select: false }) refreshHash!: string;
  @Prop({ required: true }) authVersion!: number;
  @Prop({ required: true }) lastActivityAt!: Date;
  @Prop({ required: true }) expiresAt!: Date;
  @Prop() revokedAt?: Date;
}
export const SessionSchema = SchemaFactory.createForClass(Session);
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
