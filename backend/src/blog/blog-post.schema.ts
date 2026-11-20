import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongoSchema, Types } from 'mongoose';

export enum BlogPostStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
}

@Schema({ _id: false })
export class PostImage {
  @Prop({ required: true }) id!: string;
  @Prop({ required: true }) filename!: string;
  @Prop({ required: true }) url!: string;
  @Prop({ required: true }) originalName!: string;
  @Prop({ required: true, enum: ['image/jpeg', 'image/png'] }) mimeType!: string;
  @Prop({ required: true, min: 1, max: 5 * 1024 * 1024 }) size!: number;
  @Prop({ default: () => new Date() }) uploadedAt!: Date;
}
export const PostImageSchema = SchemaFactory.createForClass(PostImage);

@Schema({ timestamps: true, collection: 'blog_posts', optimisticConcurrency: true })
export class BlogPost {
  @Prop({ type: MongoSchema.Types.ObjectId }) itineraryId?: Types.ObjectId;
  @Prop({ type: MongoSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  authorId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, minlength: 1, maxlength: 150 })
  title!: string;

  @Prop({ type: String, required: true, trim: true, minlength: 1, maxlength: 30000 })
  body!: string;

  @Prop({ type: String, enum: BlogPostStatus, required: true, default: BlogPostStatus.DRAFT })
  status!: BlogPostStatus;

  @Prop({ type: [String], default: [], validate: { validator: (tags: string[]) => tags.length <= 5 } })
  tags!: string[];

  @Prop({ type: [PostImageSchema], default: [], validate: { validator: (images: PostImage[]) => images.length <= 5 } })
  images!: PostImage[];

  @Prop({ type: Date }) publishedAt?: Date;

  /** GEN-10: hidden by an administrator; never shown publicly. */
  @Prop({ type: Boolean, default: false }) hidden!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}
export type BlogPostDocument = HydratedDocument<BlogPost>;
export const BlogPostSchema = SchemaFactory.createForClass(BlogPost);
BlogPostSchema.index({ status: 1, publishedAt: -1, _id: -1 });
BlogPostSchema.index({ authorId: 1, createdAt: -1 });
BlogPostSchema.index({ status: 1, tags: 1, publishedAt: -1 });
