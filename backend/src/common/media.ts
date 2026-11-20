import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { imageKind, MAX_IMAGE_BYTES } from '../blog/blog-posts.utils';

/** GEN-08: stored image names are random UUIDs with a verified JPG/PNG extension. */
export const MEDIA_FILE_NAME = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.(?:jpg|png)$/i;

export const mediaDir = (folder: string) => join(process.cwd(), 'uploads', folder);

/** Checks every file is real JPG/PNG content of at most 5 MB and gives it a server-side name. */
export function prepareImages(files: Express.Multer.File[] | undefined) {
  if (!files?.length) throw new BadRequestException('Upload at least one image');
  return files.map((file) => {
    if (!file.buffer?.length || file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Every image must be <= 5 MB');
    }
    const kind = imageKind(file.buffer);
    if (!kind || kind.mimeType !== file.mimetype) {
      throw new BadRequestException('Only valid JPG and PNG images are accepted');
    }
    return { filename: `${randomUUID()}${kind.ext}`, data: file.buffer };
  });
}

/** Writes prepared images; on failure removes the ones already written. */
export async function storeImages(folder: string, images: { filename: string; data: Buffer }[]) {
  const dir = mediaDir(folder);
  await mkdir(dir, { recursive: true });
  const written: string[] = [];
  try {
    for (const image of images) {
      const path = join(dir, image.filename);
      await writeFile(path, image.data, { flag: 'wx' });
      written.push(path);
    }
  } catch (error) {
    await Promise.all(written.map((path) => unlink(path).catch(() => undefined)));
    throw error;
  }
  return async () => {
    await Promise.all(written.map((path) => unlink(path).catch(() => undefined)));
  };
}

export async function removeImage(folder: string, filename: string) {
  if (!MEDIA_FILE_NAME.test(filename)) return;
  await unlink(join(mediaDir(folder), filename)).catch(() => undefined);
}

/** The stored file name at the end of a served media URL, if it is one of ours. */
export function mediaFileName(url: string, prefix: string): string | undefined {
  if (!url.startsWith(prefix)) return undefined;
  const name = url.slice(prefix.length);
  return MEDIA_FILE_NAME.test(name) ? name : undefined;
}
