import { Controller, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { BlogService } from './blog.service';
import { JwtAuthGuard, CurrentUser } from '../auth/guards';

@Controller('blog')
@UseGuards(JwtAuthGuard)
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Post('posts/:postId/comments')
  async addComment(@CurrentUser() user: any, @Param('postId') postId: string, @Body('content') content: string) {
    return this.blogService.addComment(postId, user.id, content);
  }

  @Patch('comments/:commentId')
  async editComment(@CurrentUser() user: any, @Param('commentId') commentId: string, @Body('content') content: string) {
    return this.blogService.updateComment(commentId, user.id, content);
  }

  @Delete('comments/:commentId')
  async removeComment(@CurrentUser() user: any, @Param('commentId') commentId: string) {
    return this.blogService.deleteComment(commentId, user.id);
  }

  @Post('posts/:postId/like')
  async toggleLike(@CurrentUser() user: any, @Param('postId') postId: string) {
    return this.blogService.toggleLike(postId, user.id);
  }
}