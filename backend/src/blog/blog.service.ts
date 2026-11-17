import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BlogComment, PostLike } from './blog.schema';

@Injectable()
export class BlogService {
  constructor(
    @InjectModel(BlogComment.name) private commentModel: Model<BlogComment>,
    @InjectModel(PostLike.name) private likeModel: Model<PostLike>,
  ) {}

  // BLG-05: Add comment
  async addComment(postId: string, userId: string, content: string) {
    return this.commentModel.create({
      postId: new Types.ObjectId(postId),
      userId: new Types.ObjectId(userId),
      content,
    });
  }

  // BLG-06: Edit & Delete comments (with ownership checks)
  async updateComment(commentId: string, userId: string, content: string) {
    const comment = await this.commentModel.findById(commentId);
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.userId.toString() !== userId) throw new ForbiddenException('Unauthorized to edit this comment');

    comment.content = content;
    return comment.save();
  }

  async deleteComment(commentId: string, userId: string) {
    const comment = await this.commentModel.findById(commentId);
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.userId.toString() !== userId) throw new ForbiddenException('Unauthorized to delete this comment');

    return this.commentModel.findByIdAndDelete(commentId);
  }

  // BLG-07: Toggle like ensuring each user can like a post only once
  async toggleLike(postId: string, userId: string) {
    const filter = { postId: new Types.ObjectId(postId), userId: new Types.ObjectId(userId) };
    const existing = await this.likeModel.findOne(filter);

    if (existing) {
      await this.likeModel.deleteOne(filter);
      return { liked: false, message: 'Like removed' };
    } else {
      try {
        await this.likeModel.create(filter);
        return { liked: true, message: 'Post liked' };
      } catch (err) {
        throw new BadRequestException('You have already liked this post.');
      }
    }
  }
}