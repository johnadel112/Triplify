import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Report, ReportSchema } from './reports.schema';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BlogModule } from '../blog/blog.module';
import { BlogPost, BlogPostSchema } from '../blog/blog-post.schema';
import { BlogComment, BlogCommentSchema } from '../blog/blog.schema';
import { Review, ReviewSchema } from '../hotel-bookings/review.schema';
import { Itinerary, ItinerarySchema } from '../itineraries/itineraries.schema';
import { ContentModerationService } from './content-moderation.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Report.name, schema: ReportSchema },
      // Reported content (GEN-10); same schema objects as the owning modules.
      { name: BlogPost.name, schema: BlogPostSchema },
      { name: BlogComment.name, schema: BlogCommentSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: Itinerary.name, schema: ItinerarySchema },
    ]),
    AuditModule,
    NotificationsModule,
    BlogModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService, ContentModerationService],
  exports: [ReportsService],
})
export class ReportsModule {}
