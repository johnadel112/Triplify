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
}

export const BlogCommentSchema = SchemaFactory.createForClass(BlogComment);

@Schema({ timestamps: true })
export class PostLike {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  postId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;
}

export const PostLikeSchema = SchemaFactory.createForClass(PostLike);
PostLikeSchema.index({ postId: 1, userId: 1 }, { unique: true });
