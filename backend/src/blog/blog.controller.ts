import { Controller, Post, Patch, Delete, Body, Param, Get, Query } from '@nestjs/common';
import { BlogService } from './blog.service';
import { CurrentUser, Public } from '../auth/guards';
import { Principal } from '../common/domain';
import { ObjectIdPipe } from '../common/http';
import { ApiOperation } from '@nestjs/swagger';
import { BlogPageDto, CommentDto } from './blog-posts.dto';

@Controller('blog')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Public()
  @Get('posts/:postId/comments')
  @ApiOperation({ summary: 'BLG-05: Visible comments of a published post (paginated)' })
  async listComments(
    @Param('postId', ObjectIdPipe) postId: string,
    @Query() query: BlogPageDto,
  ) {
    return this.blogService.listComments(postId, query.page);
  }

  @Post('posts/:postId/comments')
  @ApiOperation({ summary: 'BLG-05: Comment on a published post' })
  async addComment(@CurrentUser() user: Principal, @Param('postId', ObjectIdPipe) postId: string, @Body() dto: CommentDto) {
    return this.blogService.addComment(postId, user.id, dto.content);
  }

  @Patch('comments/:commentId')
  @ApiOperation({ summary: 'BLG-07: Edit my own comment' })
  async editComment(@CurrentUser() user: Principal, @Param('commentId', ObjectIdPipe) commentId: string, @Body() dto: CommentDto) {
    return this.blogService.updateComment(commentId, user.id, dto.content);
  }

  @Delete('comments/:commentId')
  @ApiOperation({ summary: 'BLG-07: Delete my own comment' })
  async removeComment(@CurrentUser() user: Principal, @Param('commentId', ObjectIdPipe) commentId: string) {
    return this.blogService.deleteComment(commentId, user.id);
  }

  @Post('posts/:postId/like')
  @ApiOperation({ summary: 'BLG-06: Like or unlike a published post (toggle)' })
  async toggleLike(@CurrentUser() user: Principal, @Param('postId', ObjectIdPipe) postId: string) {
    return this.blogService.toggleLike(postId, user.id);
  }
}
