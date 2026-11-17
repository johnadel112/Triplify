import { BadRequestException } from '@nestjs/common';

export const BLOG_PAGE_SIZE = 10;
export const MAX_POST_IMAGES = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function normalizeTags(input: string[] = []): string[] {
  if (input.length > 5) throw new BadRequestException('At most five tags are allowed');
  const tags = input.map((tag) => tag.trim().toLowerCase());
  if (tags.some((tag) => !tag || tag.length > 30)) {
    throw new BadRequestException('Tags must contain 1-30 characters after trimming');
  }
  if (new Set(tags).size !== tags.length) {
    throw new BadRequestException('Duplicate tags are not allowed');
  }
  return tags;
}

export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function excerpt(body: string, max = 160): string {
  const plain = body.replace(/\s+/g, ' ').trim();
  return plain.length > max ? `${plain.slice(0, max).trimEnd()}…` : plain;
}

/** Check file contents, not just the client-supplied MIME type or extension. */
export function imageKind(buffer: Buffer): { mimeType: 'image/jpeg' | 'image/png'; ext: '.jpg' | '.png' } | null {
  const png = buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (png) return { mimeType: 'image/png', ext: '.png' };
  const jpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (jpeg) return { mimeType: 'image/jpeg', ext: '.jpg' };
  return null;
}
