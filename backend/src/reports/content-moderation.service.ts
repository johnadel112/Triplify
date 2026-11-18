import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BlogComment } from '../blog/blog.schema';
import { BlogPost } from '../blog/blog-post.schema';
import { BlogPostsService } from '../blog/blog-posts.service';
import { Review } from '../hotel-bookings/review.schema';
import { Itinerary } from '../itineraries/itineraries.schema';
import { ReportTargetType } from './reports.schema';

export type ModerationAction = 'HIDE' | 'DELETE';
type Hideable = Model<{ hidden: boolean }>;

/**
 * GEN-10: applies an administrator's hide/delete decision to the reported content itself.
 * Every content type stores `hidden`, and its public reads exclude hidden documents.
 */
@Injectable()
export class ContentModerationService {
  private readonly models: Record<ReportTargetType, Hideable>;

  constructor(
    @InjectModel(BlogPost.name) posts: Model<BlogPost>,
    @InjectModel(BlogComment.name) comments: Model<BlogComment>,
    @InjectModel(Review.name) reviews: Model<Review>,
    @InjectModel(Itinerary.name) itineraries: Model<Itinerary>,
    private readonly blogPosts: BlogPostsService,
  ) {
    this.models = {
      [ReportTargetType.POST]: posts as unknown as Hideable,
      [ReportTargetType.COMMENT]: comments as unknown as Hideable,
      [ReportTargetType.REVIEW]: reviews as unknown as Hideable,
      [ReportTargetType.ITINERARY]: itineraries as unknown as Hideable,
    };
  }

  /** Throws 404 CONTENT_NOT_FOUND (and changes nothing) when the content does not exist. */
  async apply(type: ReportTargetType, targetId: string, action: ModerationAction) {
    if (!Types.ObjectId.isValid(targetId)) throw this.notFound(type);
    const _id = new Types.ObjectId(targetId);
    const model = this.models[type];

    if (action === 'HIDE') {
      const result = await model.updateOne({ _id }, { $set: { hidden: true } });
      if (!result.matchedCount) throw this.notFound(type);
      return;
    }

    if (type === ReportTargetType.POST) {
      // Same cleanup as an author deleting their own post: comments, likes and image files.
      await this.blogPosts.removeByModeration(targetId).catch((error: unknown) => {
        throw error instanceof NotFoundException ? this.notFound(type) : error;
      });
      return;
    }
    const result = await model.deleteOne({ _id });
    if (!result.deletedCount) throw this.notFound(type);
  }

  private notFound(type: ReportTargetType) {
    return new NotFoundException({
      code: 'CONTENT_NOT_FOUND',
      message: `${type.toLowerCase()} not found`,
    });
  }
}
