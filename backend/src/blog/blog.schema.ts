import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ timestamps: true })
export class BlogComment {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  postId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  content!: string;

  /** GEN-10: hidden by an administrator; comment listings must exclude it. */
  @Prop({ type: Boolean, default: false })
  hidden!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const BlogCommentSchema = SchemaFactory.createForClass(BlogComment);
BlogCommentSchema.index({ postId: 1, hidden: 1, createdAt: -1, _id: -1 });

@Schema({ timestamps: true })
export class PostLike {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  postId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;
}

export const PostLikeSchema = SchemaFactory.createForClass(PostLike);
PostLikeSchema.index({ postId: 1, userId: 1 }, { unique: true });
