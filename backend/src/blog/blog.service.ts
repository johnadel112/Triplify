import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BlogComment, PostLike } from './blog.schema';
import { BlogPost, BlogPostStatus } from './blog-post.schema';
import { User } from '../users/user.schema';
import { AccountStatus } from '../common/domain';

@Injectable()
export class BlogService {
  constructor(
    @InjectModel(BlogComment.name) private commentModel: Model<BlogComment>,
    @InjectModel(PostLike.name) private likeModel: Model<PostLike>,
    @InjectModel(BlogPost.name) private postModel: Model<BlogPost>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  async listComments(postId: string, page = 1) {
    const post = await this.postModel.exists({
      _id: new Types.ObjectId(postId), status: BlogPostStatus.PUBLISHED, hidden: { $ne: true },
    });
    if (!post) throw new NotFoundException('Published post not found');
    const filter = { postId: new Types.ObjectId(postId), hidden: { $ne: true }, deletedAt: { $exists: false } };
    const [comments, total] = await Promise.all([
      this.commentModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 10).limit(10).lean(),
      this.commentModel.countDocuments(filter),
    ]);
    const authors = await this.userModel.find({ _id: { $in: comments.map((comment) => comment.userId) } })
      .select('name status').lean();
    const byId = new Map(authors.map((author) => [author._id.toString(), author]));
    return {
      items: comments.map((comment) => {
        const author = byId.get(comment.userId.toString());
        return {
          id: comment._id.toString(), content: comment.content,
          author: {
            id: comment.userId.toString(),
            name: !author || author.status === AccountStatus.DEACTIVATED ? 'Deleted user' : author.name,
          },
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
        };
      }),
      total, page, pageCount: Math.ceil(total / 10),
    };
  }

  // BLG-05: Add comment
  async addComment(postId: string, userId: string, content: string) {
    if (!content?.trim() || content.trim().length > 500) {
      throw new BadRequestException('Comment must be 1-500 characters');
    }
    const post = await this.postModel.exists({
      _id: new Types.ObjectId(postId), status: BlogPostStatus.PUBLISHED, hidden: { $ne: true },
    });
    if (!post) throw new NotFoundException('Published post not found');
    return this.commentModel.create({
      postId: new Types.ObjectId(postId),
      userId: new Types.ObjectId(userId),
      content: content.trim(),
    });
  }

  // BLG-06: Edit & Delete comments (with ownership checks)
  async updateComment(commentId: string, userId: string, content: string) {
    if (!content?.trim() || content.trim().length > 500) {
      throw new BadRequestException('Comment must be 1-500 characters');
    }
    const comment = await this.commentModel.findById(commentId);
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.userId.toString() !== userId) throw new ForbiddenException('Unauthorized to edit this comment');

    comment.content = content.trim();
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
    // BLG-07: only published, visible posts can be liked (same rule as comments).
    const post = await this.postModel.exists({
      _id: new Types.ObjectId(postId), status: BlogPostStatus.PUBLISHED, hidden: { $ne: true },
    });
    if (!post) throw new NotFoundException('Published post not found');
    const filter = { postId: new Types.ObjectId(postId), userId: new Types.ObjectId(userId) };
    const existing = await this.likeModel.findOne(filter);

    if (existing) {
      await this.likeModel.deleteOne(filter);
      return { liked: false, message: 'Like removed' };
    } else {
      try {
        await this.likeModel.create(filter);
        return { liked: true, message: 'Post liked' };
      } catch {
        throw new BadRequestException('You have already liked this post.');
      }
    }
  }
}
