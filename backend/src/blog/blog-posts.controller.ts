import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
  UploadedFiles, UseInterceptors, Res,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { CurrentUser, Public, Roles } from '../auth/guards';
import { Principal, UserRole } from '../common/domain';
import { ConfirmationDto } from '../common/dto';
import { ObjectIdPipe } from '../common/http';
import { BlogPostsService } from './blog-posts.service';
import {
  BlogPageDto, BlogSearchDto, CreateBlogPostDto,
  MyBlogPostsDto, UpdateBlogPostDto,
} from './blog-posts.dto';
import { MAX_IMAGE_BYTES } from './blog-posts.utils';

@ApiTags('Blog Posts')
@ApiCookieAuth()
@Controller('blog/posts')
export class BlogPostsController {
  constructor(private readonly posts: BlogPostsService) {}

  @Post()
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'BLG-01: Create a draft or published blog post' })
  create(@CurrentUser() actor: Principal, @Body() dto: CreateBlogPostDto) {
    return this.posts.create(actor, dto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'BLG-02: Paginated published posts, optionally filtered by tag/keyword' })
  list(@Query() query: BlogSearchDto) {
    return this.posts.search(query);
  }

  @Public()
  @Get('search')
  @ApiOperation({ summary: 'BLG-09: Search published posts by title, tags, author name' })
  search(@Query() query: BlogSearchDto) {
    return this.posts.search(query);
  }

  @Get('mine')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'BLG-03: Private list of my drafts and published posts' })
  mine(@CurrentUser() actor: Principal, @Query() query: MyBlogPostsDto) {
    return this.posts.mine(actor, query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'BLG-02: View a published post with likes and comments count' })
  findOne(@Param('id', ObjectIdPipe) id: string) {
    return this.posts.getPublished(id);
  }

  @Patch(':id')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'BLG-04/BLG-08: Update my own post, its tags, or draft/publish status' })
  update(@CurrentUser() actor: Principal, @Param('id', ObjectIdPipe) id: string,
    @Body() dto: UpdateBlogPostDto) {
    return this.posts.update(actor, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'BLG-04: Confirm deletion of my own post' })
  remove(@CurrentUser() actor: Principal, @Param('id', ObjectIdPipe) id: string,
    @Body() _confirmation: ConfirmationDto) {
    return this.posts.remove(actor, id);
  }

  @Post(':id/images')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'BLG-10: Upload up to 5 JPG/PNG images, max 5MB each, onto my post' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: {
    images: { type: 'array', items: { type: 'string', format: 'binary' } },
  } } })
  @UseInterceptors(FilesInterceptor('images', 5, {
    storage: memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES, files: 5 },
  }))
  uploadImages(@CurrentUser() actor: Principal, @Param('id', ObjectIdPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[]) {
    return this.posts.addImages(actor, id, files);
  }

  @Delete(':id/images/:imageId')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'BLG-10: Remove an attached image from my post' })
  deleteImage(@CurrentUser() actor: Principal, @Param('id', ObjectIdPipe) id: string,
    @Param('imageId') imageId: string) {
    return this.posts.removeImage(actor, id, imageId);
  }
}

@ApiTags('Blog Authors')
@Controller('blog/authors')
export class BlogAuthorsController {
  constructor(private readonly posts: BlogPostsService) {}

  @Public()
  @Get(':authorId')
  @ApiOperation({ summary: 'BLG-12: Public author profile, published posts and public itineraries' })
  author(@Param('authorId', ObjectIdPipe) id: string, @Query() query: BlogPageDto) {
    return this.posts.publicAuthorPage(id, query);
  }
}

@ApiTags('Blog Media')
@Controller('blog/media')
export class BlogMediaController {
  constructor(private readonly posts: BlogPostsService) {}

  @Public()
  @Get(':filename')
  @ApiOperation({ summary: 'BLG-10: Serve an image only if attached to a published post' })
  async media(@Param('filename') filename: string, @Res() res: Response) {
    const path = await this.posts.publishedImage(filename);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(path, (error) => {
      if (error && !res.headersSent) {
        res.status(404).json({ statusCode: 404, message: 'Image not found' });
      }
    });
  }
}
