import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountsModule } from '../auth/accounts.module';
import { Itinerary, ItinerarySchema } from '../itineraries/itineraries.schema';
import { User, UserSchema } from '../users/user.schema';
// Existing teammate code is intentionally preserved.
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';
import { BlogComment, BlogCommentSchema, PostLike, PostLikeSchema } from './blog.schema';
// Magdy's independent blog-post core.
import { BlogPost, BlogPostSchema } from './blog-post.schema';
import { BlogPostsService } from './blog-posts.service';
import { BlogPostsController, BlogAuthorsController, BlogMediaController } from './blog-posts.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BlogComment.name, schema: BlogCommentSchema },
      { name: PostLike.name, schema: PostLikeSchema },
      { name: BlogPost.name, schema: BlogPostSchema },
      { name: User.name, schema: UserSchema },
      { name: Itinerary.name, schema: ItinerarySchema },
    ]),
    AccountsModule,
  ],
  controllers: [
    BlogController, // teammate: comments and likes
    BlogPostsController,
    BlogAuthorsController,
    BlogMediaController,
  ],
  providers: [BlogService, BlogPostsService],
  exports: [BlogService, BlogPostsService],
})
export class BlogModule {}
