import { BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join, relative, sep } from 'path';
import type { Response } from 'express';
import { uploadCloudImage, deleteCloudImage, readCloudImage } from './cloudinary';
import { imageKind, MAX_IMAGE_BYTES } from '../blog/blog-posts.utils';

/** GEN-08: stored image names are random UUIDs with a verified JPG/PNG extension. */
export const MEDIA_FILE_NAME = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.(?:jpg|png)$/i;

export const mediaDir = (folder: string) => join(process.cwd(), 'uploads', folder);

/** Checks every file is real JPG/PNG content of at most 5 MB and gives it a server-side name. */
export function prepareImages(files: Express.Multer.File[] | undefined) {
  if (!files?.length) throw new BadRequestException('Upload at least one image');
  return files.map((file) => {
    if (!file.buffer?.length || file.size > MAX_IMAGE_BYTES || file.buffer.length > MAX_IMAGE_BYTES) {
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
  for (const image of images) assertMediaKey(folder, image.filename);
  if (process.env.MEDIA_STORAGE === 'cloudinary') {
    const attempted: string[] = [];
    const rollback = async () => {
      await Promise.all(attempted.map(filename => removeImage(folder, filename)));
    };
    try {
      for (const image of images) {
        attempted.push(image.filename);
        await uploadCloudImage(folder, image.filename, image.data);
      }
    } catch (error) {
      await rollback();
      throw error;
    }
    return rollback;
  }
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
  assertMediaKey(folder, filename);
  if (process.env.MEDIA_STORAGE === 'cloudinary') {
    await deleteCloudImage(folder, filename).catch(() => {
      new Logger('MediaStorage').warn('Cloud image cleanup failed; an orphaned asset may need removal');
    });
    return;
  }
  await unlink(join(mediaDir(folder), filename)).catch(() => undefined);
}

function assertMediaKey(folder: string, filename: string) {
  if (!['hotels', 'airlines', 'activities', 'blog-posts'].includes(folder) || !MEDIA_FILE_NAME.test(filename)) {
    throw new NotFoundException('Image not found');
  }
}

/** Call only after a service has checked the image's current visibility/ownership. */
export async function sendStoredImage(res: Response, path: string) {
  const parts = relative(join(process.cwd(), 'uploads'), path).split(sep);
  if (parts.length !== 2) throw new NotFoundException('Image not found');
  const [folder, filename] = parts;
  assertMediaKey(folder, filename);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Recheck access on every request, including after publication/ownership changes.
  res.setHeader('Cache-Control', 'private, no-store');
  if (process.env.MEDIA_STORAGE === 'cloudinary') {
    const bytes = await readCloudImage(folder, filename);
    res.type(filename.endsWith('.png') ? 'png' : 'jpg').send(bytes);
    return;
  }
  res.sendFile(path, (error) => {
    if (error && !res.headersSent) res.status(404).json({ statusCode: 404, message: 'Image not found' });
  });
}

/** The stored file name at the end of a served media URL, if it is one of ours. */
export function mediaFileName(url: string, prefix: string): string | undefined {
  if (!url.startsWith(prefix)) return undefined;
  const name = url.slice(prefix.length);
  return MEDIA_FILE_NAME.test(name) ? name : undefined;
}
