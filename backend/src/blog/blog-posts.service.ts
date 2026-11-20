import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { FilterQuery, Model, Types } from 'mongoose';
import { AccountStatus, Principal, UserRole } from '../common/domain';
import { Itinerary } from '../itineraries/itineraries.schema';
import { User } from '../users/user.schema';
import { BlogComment, PostLike } from './blog.schema';
import { BlogPost, BlogPostStatus, PostImage } from './blog-post.schema';
import {
  BlogPageDto,
  BlogSearchDto,
  CreateBlogPostDto,
  MyBlogPostsDto,
  UpdateBlogPostDto,
} from './blog-posts.dto';
import {
  BLOG_PAGE_SIZE, escapeRegex, excerpt, imageKind,
  MAX_IMAGE_BYTES, MAX_POST_IMAGES, normalizeTags,
} from './blog-posts.utils';

const MEDIA_DIR = join(process.cwd(), 'uploads', 'blog-posts');
const PUBLIC_MEDIA_PREFIX = '/api/blog/media/';
const OBJECT_ID = /^[\da-f]{24}$/i;
const FILE_NAME = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.(?:jpg|png)$/i;

type Row = {
  _id: Types.ObjectId;
  authorId: Types.ObjectId;
  title: string;
  body: string;
  tags: string[];
  images: PostImage[];
  status: BlogPostStatus;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class BlogPostsService {
  constructor(
    @InjectModel(BlogPost.name) private readonly posts: Model<BlogPost>,
    @InjectModel(BlogComment.name) private readonly comments: Model<BlogComment>,
    @InjectModel(PostLike.name) private readonly likes: Model<PostLike>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Itinerary.name) private readonly itineraries: Model<Itinerary>,
  ) {}

  private validId(id: string): Types.ObjectId {
    if (!OBJECT_ID.test(id)) throw new NotFoundException('Post or author not found');
    return new Types.ObjectId(id);
  }

  private requireAuthor(actor: Principal): void {
    if (actor.role !== UserRole.USER) {
      throw new ForbiddenException('Only registered travelers may manage blog posts');
    }
  }

  private async ownPost(actor: Principal, id: string) {
    this.requireAuthor(actor);
    const post = await this.posts.findOne({
      _id: this.validId(id),
      authorId: this.validId(actor.id),
    });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  /** Adds safe author details and counts; never exposes auth secrets or hidden draft details. */
  private async present(rows: Row[], includeBody = false, includeStatus = false) {
    if (!rows.length) return [];
    const postIds = rows.map((post) => post._id);
    const authorIds = [...new Set(rows.map((post) => post.authorId.toString()))].map(
      (id) => new Types.ObjectId(id),
    );
    const [authors, likes, comments] = await Promise.all([
      this.users.find({ _id: { $in: authorIds } })
        .select('name createdAt status').lean(),
      this.likes.aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { postId: { $in: postIds } } },
        { $group: { _id: '$postId', count: { $sum: 1 } } },
      ]),
      this.comments.aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { postId: { $in: postIds } } },
        { $group: { _id: '$postId', count: { $sum: 1 } } },
      ]),
    ]);
    const byAuthor = new Map(authors.map((u) => [u._id.toString(), u]));
    const likeCount = new Map(likes.map((x) => [x._id.toString(), x.count]));
    const commentCount = new Map(comments.map((x) => [x._id.toString(), x.count]));
    return rows.map((post) => {
      const author = byAuthor.get(post.authorId.toString());
      return {
        id: post._id.toString(),
        title: post.title,
        ...(includeBody ? { body: post.body } : {}),
        excerpt: excerpt(post.body),
        tags: post.tags,
        images: post.images.map((img) => ({
          id: img.id,
          url: img.url,
          originalName: img.originalName,
          mimeType: img.mimeType,
        })),
        author: {
          id: post.authorId.toString(),
          name: author && author.status !== AccountStatus.DEACTIVATED
            ? author.name : 'Deleted user',
          joinedAt: author?.createdAt ?? null,
        },
        ...(includeStatus ? { status: post.status } : {}),
        likeCount: likeCount.get(post._id.toString()) ?? 0,
        commentCount: commentCount.get(post._id.toString()) ?? 0,
        createdAt: post.createdAt,
        publishedAt: post.publishedAt ?? null,
        updatedAt: post.updatedAt,
      };
    });
  }

  // BLG-01: draft/publish, automatically scoped to authenticated author.
  async create(actor: Principal, dto: CreateBlogPostDto) {
    this.requireAuthor(actor);
    const status = dto.status ?? BlogPostStatus.DRAFT;
    const saved = await this.posts.create({
      title: dto.title,
      body: dto.body,
      authorId: this.validId(actor.id),
      tags: normalizeTags(dto.tags ?? []),
      images: [],
      status,
      ...(status === BlogPostStatus.PUBLISHED ? { publishedAt: new Date() } : {}),
    });
    const [view] = await this.present([
      saved.toObject() as unknown as Row,
    ], true, true);
    return view;
  }

  // BLG-02 / BLG-09: only PUBLISHED posts; keyword in title, tags or author name.
  async search(query: BlogSearchDto) {
    const where: FilterQuery<BlogPost> = {
      status: BlogPostStatus.PUBLISHED,
      hidden: { $ne: true },
      authorId: { $nin: await this.deactivatedUserIds() },
    };
    if (query.tag) where.tags = normalizeTags([query.tag])[0];
    const q = query.q?.trim();
    if (q) {
      const regex = new RegExp(escapeRegex(q), 'i');
      const matchingAuthors = await this.users.find({ name: regex })
        .select('_id').limit(500).lean();
      where.$or = [
        { title: regex },
        { tags: regex },
        { authorId: { $in: matchingAuthors.map((u) => u._id) } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.posts.find(where)
        .sort({ publishedAt: -1, _id: -1 })
        .skip((query.page - 1) * BLOG_PAGE_SIZE)
        .limit(BLOG_PAGE_SIZE).lean(),
      this.posts.countDocuments(where),
    ]);
    return {
      items: await this.present(rows as unknown as Row[]),
      total,
      page: query.page,
      pageCount: Math.ceil(total / BLOG_PAGE_SIZE),
      message: total ? undefined : 'No published posts match your search',
    };
  }

  // BLG-03: drafts may be seen only by their own author.
  async mine(actor: Principal, query: MyBlogPostsDto) {
    this.requireAuthor(actor);
    const where: FilterQuery<BlogPost> = { authorId: this.validId(actor.id) };
    if (query.status) where.status = query.status;
    const [rows, total] = await Promise.all([
      this.posts.find(where).sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * BLOG_PAGE_SIZE)
        .limit(BLOG_PAGE_SIZE).lean(),
      this.posts.countDocuments(where),
    ]);
    return {
      items: await this.present(rows as unknown as Row[], true, true),
      total,
      page: query.page,
      pageCount: Math.ceil(total / BLOG_PAGE_SIZE),
    };
  }

  // BLG-02: guests can see published posts, never drafts.
  async getPublished(postId: string) {
    const row = await this.posts.findOne({
      _id: this.validId(postId), status: BlogPostStatus.PUBLISHED, hidden: { $ne: true },
      authorId: { $nin: await this.deactivatedUserIds() },
    }).lean();
    if (!row) throw new NotFoundException('Published post not found');
    const [view] = await this.present([row as unknown as Row], true);
    return view;
  }

  // BLG-04 / BLG-08: only the author can edit title, body, status or tags.
  async update(actor: Principal, postId: string, dto: UpdateBlogPostDto) {
    const post = await this.ownPost(actor, postId);
    if (!Object.keys(dto).length) throw new BadRequestException('No fields provided');
    if (Object.values(dto).some((value) => value === null)) {
      throw new BadRequestException('Null is not a valid post field value');
    }
    if (dto.title !== undefined) post.title = dto.title;
    if (dto.body !== undefined) post.body = dto.body;
    if (dto.tags !== undefined) post.tags = normalizeTags(dto.tags);
    if (dto.status !== undefined && dto.status !== post.status) {
      post.status = dto.status;
      post.publishedAt = dto.status === BlogPostStatus.PUBLISHED ? new Date() : undefined;
    }
    await post.save();
    const [view] = await this.present([post.toObject() as unknown as Row], true, true);
    return view;
  }

  // BLG-04: deletion cascades old comments and likes without changing teammates' code.
  async remove(actor: Principal, postId: string) {
    const post = await this.ownPost(actor, postId);
    await this.deleteWithDependents(post._id, post.images);
    return { deleted: true };
  }

  /** GEN-10: administrator deletion of a reported post, with the same cleanup as remove(). */
  async removeByModeration(postId: string) {
    const post = await this.posts.findById(this.validId(postId)).select('images').lean();
    if (!post) throw new NotFoundException('Post not found');
    await this.deleteWithDependents(post._id, post.images);
  }

  /** Deletes a post with its comments, likes and stored image files. */
  private async deleteWithDependents(postId: Types.ObjectId, images: { filename: string }[]) {
    const files = images.map((image) => image.filename);
    await this.posts.deleteOne({ _id: postId });
    await Promise.all([
      this.comments.deleteMany({ postId }),
      this.likes.deleteMany({ postId }),
    ]);
    await Promise.all(files.map((file) =>
      unlink(join(MEDIA_DIR, file)).catch(() => undefined),
    ));
  }

  // BLG-10 / GEN-08: upload to the server; actual JPG/PNG bytes, <= 5MB each, max 5/post.
  async addImages(actor: Principal, postId: string, files: Express.Multer.File[]) {
    const post = await this.ownPost(actor, postId);
    if (!files?.length) throw new BadRequestException('Upload at least one image');
    if (post.images.length + files.length > MAX_POST_IMAGES) {
      throw new BadRequestException('A post can have at most five images');
    }
    const prepared = files.map((file) => {
      if (!file.buffer?.length || file.size > MAX_IMAGE_BYTES) {
        throw new BadRequestException('Every image must be <= 5 MB');
      }
      const kind = imageKind(file.buffer);
      if (!kind || kind.mimeType !== file.mimetype) {
        throw new BadRequestException('Only valid JPG and PNG images are accepted');
      }
      const id = randomUUID();
      const filename = `${id}${kind.ext}`;
      return {
        metadata: {
          id, filename, url: `${PUBLIC_MEDIA_PREFIX}${filename}`,
          originalName: file.originalname.slice(0, 150), mimeType: kind.mimeType,
          size: file.size, uploadedAt: new Date(),
        } as PostImage,
        data: file.buffer,
      };
    });
    await mkdir(MEDIA_DIR, { recursive: true });
    const written: string[] = [];
    try {
      for (const img of prepared) {
        const fullPath = join(MEDIA_DIR, img.metadata.filename);
        await writeFile(fullPath, img.data, { flag: 'wx' });
        written.push(fullPath);
      }
      post.images.push(...prepared.map((img) => img.metadata));
      await post.save();
    } catch (error) {
      await Promise.all(written.map((path) => unlink(path).catch(() => undefined)));
      throw error;
    }
    const [view] = await this.present([post.toObject() as unknown as Row], true, true);
    return view;
  }

  async removeImage(actor: Principal, postId: string, imageId: string) {
    const post = await this.ownPost(actor, postId);
    const image = post.images.find((entry) => entry.id === imageId);
    if (!image) throw new NotFoundException('Image not found on this post');
    post.images = post.images.filter((entry) => entry.id !== imageId);
    await post.save();
    await unlink(join(MEDIA_DIR, image.filename)).catch(() => undefined);
    return { removed: true, imageId };
  }

  /** ACC-12: posts of deactivated accounts are hidden from public pages. */
  private async deactivatedUserIds() {
    return this.users.find({ status: AccountStatus.DEACTIVATED }).distinct('_id');
  }

  /** Media from drafts remains private. No arbitrary files or paths can be requested. */
  async publishedImage(filename: string): Promise<string> {
    if (!FILE_NAME.test(filename)) throw new NotFoundException('Image not found');
    const exists = await this.posts.exists({
      status: BlogPostStatus.PUBLISHED,
      hidden: { $ne: true },
      authorId: { $nin: await this.deactivatedUserIds() },
      'images.filename': filename,
    });
    if (!exists) throw new NotFoundException('Image not found');
    return join(MEDIA_DIR, filename);
  }

  // BLG-12: author name/join date, their published posts and public itineraries.
  async publicAuthorPage(authorId: string, query: BlogPageDto) {
    const id = this.validId(authorId);
    const author = await this.users.findOne({
      _id: id,
      status: { $ne: AccountStatus.DEACTIVATED },
    }).select('name createdAt').lean();
    if (!author) throw new NotFoundException('Author not found');
    const page = query.page;
    const postFilter = { authorId: id, status: BlogPostStatus.PUBLISHED, hidden: { $ne: true } };
    const itineraryFilter = { userId: id, isPublic: true, hidden: { $ne: true } };
    const [posts, postTotal, itineraries, itineraryTotal] = await Promise.all([
      this.posts.find(postFilter).sort({ publishedAt: -1, _id: -1 })
        .skip((page - 1) * BLOG_PAGE_SIZE).limit(BLOG_PAGE_SIZE).lean(),
      this.posts.countDocuments(postFilter),
      this.itineraries.find(itineraryFilter)
        .select('title description countries startDate createdAt')
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * BLOG_PAGE_SIZE).limit(BLOG_PAGE_SIZE).lean(),
      this.itineraries.countDocuments(itineraryFilter),
    ]);
    return {
      author: { id: author._id.toString(), name: author.name, joinedAt: author.createdAt },
      posts: {
        items: await this.present(posts as unknown as Row[]), total: postTotal, page,
        pageCount: Math.ceil(postTotal / BLOG_PAGE_SIZE),
      },
      publicItineraries: {
        items: itineraries.map((itinerary) => ({
          id: itinerary._id.toString(), title: itinerary.title,
          description: itinerary.description ?? null,
          countries: itinerary.countries, startDate: itinerary.startDate,
          createdAt: itinerary.createdAt,
        })),
        total: itineraryTotal, page, pageCount: Math.ceil(itineraryTotal / BLOG_PAGE_SIZE),
      },
    };
  }
}
