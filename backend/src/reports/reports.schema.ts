import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ReportTargetType {
  POST = 'POST',
  COMMENT = 'COMMENT',
  REVIEW = 'REVIEW',
  ITINERARY = 'ITINERARY',
}

export enum ReportStatus {
  OPEN = 'OPEN',
  DISMISSED = 'DISMISSED',
  RESOLVED_HIDDEN = 'RESOLVED_HIDDEN',
  RESOLVED_DELETED = 'RESOLVED_DELETED',
}

@Schema({ timestamps: true })
export class Report extends Document {
  @Prop({ required: true, index: true, type: Types.ObjectId, ref: 'User' })
  reporterId!: Types.ObjectId;

  @Prop({
    required: true,
    enum: Object.values(ReportTargetType),
    index: true,
  })
  targetType!: ReportTargetType;

  @Prop({ required: true, index: true })
  targetId!: string;

  @Prop({ required: true, maxlength: 1000 })
  reason!: string;

  @Prop({
    required: true,
    enum: Object.values(ReportStatus),
    default: ReportStatus.OPEN,
    index: true,
  })
  status!: ReportStatus;

  @Prop()
  resolutionNotes?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  resolvedBy?: Types.ObjectId;

  @Prop()
  resolvedAt?: Date;

  @Prop({ default: Date.now })
  createdAt!: Date;
}

export const ReportSchema = SchemaFactory.createForClass(Report);

// Enforce GEN-09: at most once per item per user
ReportSchema.index(
  { reporterId: 1, targetType: 1, targetId: 1 },
  { unique: true },
);

