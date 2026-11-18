import { Controller, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { BlogService } from './blog.service';
import { CurrentUser } from '../auth/guards';
import { Principal } from '../common/domain';

@Controller('blog')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Post('posts/:postId/comments')
  async addComment(@CurrentUser() user: Principal, @Param('postId') postId: string, @Body('content') content: string) {
    return this.blogService.addComment(postId, user.id, content);
  }

  @Patch('comments/:commentId')
  async editComment(@CurrentUser() user: Principal, @Param('commentId') commentId: string, @Body('content') content: string) {
    return this.blogService.updateComment(commentId, user.id, content);
  }

  @Delete('comments/:commentId')
  async removeComment(@CurrentUser() user: Principal, @Param('commentId') commentId: string) {
    return this.blogService.deleteComment(commentId, user.id);
  }

  @Post('posts/:postId/like')
  async toggleLike(@CurrentUser() user: Principal, @Param('postId') postId: string) {
    return this.blogService.toggleLike(postId, user.id);
  }
}