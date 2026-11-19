import { Controller, Post, Patch, Delete, Body, Param, Get, Query } from '@nestjs/common';
import { BlogService } from './blog.service';
import { CurrentUser, Public } from '../auth/guards';
import { Principal } from '../common/domain';
import { ObjectIdPipe } from '../common/http';
import { BlogPageDto } from './blog-posts.dto';

@Controller('blog')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Public()
  @Get('posts/:postId/comments')
  async listComments(
    @Param('postId', ObjectIdPipe) postId: string,
    @Query() query: BlogPageDto,
  ) {
    return this.blogService.listComments(postId, query.page);
  }

  @Post('posts/:postId/comments')
  async addComment(@CurrentUser() user: Principal, @Param('postId', ObjectIdPipe) postId: string, @Body('content') content: string) {
    return this.blogService.addComment(postId, user.id, content);
  }

  @Patch('comments/:commentId')
  async editComment(@CurrentUser() user: Principal, @Param('commentId', ObjectIdPipe) commentId: string, @Body('content') content: string) {
    return this.blogService.updateComment(commentId, user.id, content);
  }

  @Delete('comments/:commentId')
  async removeComment(@CurrentUser() user: Principal, @Param('commentId', ObjectIdPipe) commentId: string) {
    return this.blogService.deleteComment(commentId, user.id);
  }

  @Post('posts/:postId/like')
  async toggleLike(@CurrentUser() user: Principal, @Param('postId', ObjectIdPipe) postId: string) {
    return this.blogService.toggleLike(postId, user.id);
  }
}
