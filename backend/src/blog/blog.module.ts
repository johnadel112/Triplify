import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';
import { BlogComment, BlogCommentSchema, PostLike, PostLikeSchema } from './blog.schema';
import { AccountsModule } from '../auth/accounts.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BlogComment.name, schema: BlogCommentSchema },
      { name: PostLike.name, schema: PostLikeSchema },
    ]),
    AccountsModule,
  ],
  controllers: [BlogController],
  providers: [BlogService],
  exports: [BlogService],
})
export class BlogModule {}
