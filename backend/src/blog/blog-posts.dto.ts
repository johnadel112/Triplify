import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { BlogPostStatus } from './blog-post.schema';

const Trim = () => Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);

export class CreateBlogPostDto {
  @ApiProperty({ example: 'Five days discovering Aswan', maxLength: 150 })
  @Trim() @IsString() @MinLength(1) @MaxLength(150)
  title!: string;

  @ApiProperty({ example: 'Our trip started on the Nile...', maxLength: 30000 })
  @Trim() @IsString() @MinLength(1) @MaxLength(30000)
  body!: string;

  @ApiPropertyOptional({ enum: BlogPostStatus, default: BlogPostStatus.DRAFT })
  @IsOptional() @IsEnum(BlogPostStatus)
  status?: BlogPostStatus;

  @ApiPropertyOptional({ type: [String], maxItems: 5, description: 'Up to five tags of at most 30 characters each.' })
  @IsOptional() @IsArray() @ArrayMaxSize(5)
  @IsString({ each: true }) @MaxLength(30, { each: true })
  tags?: string[];
}

export class UpdateBlogPostDto extends PartialType(CreateBlogPostDto) {}

/** BLG-05: a comment body; the service also trims and re-checks the length. */
export class CommentDto {
  @ApiProperty({ minLength: 1, maxLength: 500, example: 'Great tips, thanks!' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  content!: string;
}

export class BlogPageDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000)
  page = 1;
}

export class BlogSearchDto extends BlogPageDto {
  @ApiPropertyOptional({ maxLength: 100, description: 'Keyword in title, tag, or author name' })
  @IsOptional() @Trim() @IsString() @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ maxLength: 30, description: 'Exact tag, case insensitive' })
  @IsOptional() @Trim() @IsString() @MaxLength(30)
  tag?: string;
}

export class MyBlogPostsDto extends BlogPageDto {
  @ApiPropertyOptional({ enum: BlogPostStatus })
  @IsOptional() @IsEnum(BlogPostStatus)
  status?: BlogPostStatus;
}
