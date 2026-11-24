import { ServiceUnavailableException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';

// Assets are authenticated, never public. Only the API fetches signed delivery URLs,
// after the existing database visibility/ownership checks have succeeded.
function credentials() {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud || !/^[a-zA-Z0-9_-]+$/.test(cloud) || !key || !secret) {
    throw new ServiceUnavailableException('Image storage is not configured');
  }
  return { cloud, key, secret };
}

function publicId(folder: string, filename: string) {
  return `triplify/${folder}/${filename.replace(/\.(jpg|png)$/i, '')}`;
}

async function request(action: string, params: Record<string, string>, data?: Buffer) {
  const { cloud, key, secret } = credentials();
  const signed = { ...params, timestamp: String(Math.floor(Date.now() / 1000)) };
  const signature = createHash('sha256').update(
    Object.entries(signed).sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => `${name}=${value}`).join('&') + secret,
  ).digest('hex');
  const body = new FormData();
  for (const [name, value] of Object.entries(signed)) body.set(name, value);
  body.set('api_key', key);
  body.set('signature', signature);
  if (data) body.set('file', new Blob([new Uint8Array(data)]), 'image');
  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/${action}`, {
      method: 'POST', body, signal: AbortSignal.timeout(30000), redirect: 'error',
    });
    if (!response.ok) throw new Error();
    return await response.json() as { public_id?: string; result?: string };
  } catch {
    throw new ServiceUnavailableException('Image storage request failed');
  }
}

export async function uploadCloudImage(folder: string, filename: string, data: Buffer) {
  const id = publicId(folder, filename);
  const result = await request('upload', { public_id: id, type: 'authenticated', overwrite: 'false' }, data);
  if (result.public_id !== id) throw new ServiceUnavailableException('Image storage upload failed');
}

export async function deleteCloudImage(folder: string, filename: string) {
  const result = await request('destroy', {
    public_id: publicId(folder, filename), type: 'authenticated', invalidate: 'true',
  });
  if (!['ok', 'not found'].includes(result.result ?? '')) {
    throw new ServiceUnavailableException('Image storage deletion failed');
  }
}

export async function readCloudImage(folder: string, filename: string): Promise<Buffer> {
  const { cloud, secret } = credentials();
  const path = `triplify/${folder}/${filename}`;
  const signature = createHash('sha256').update(path + secret).digest('base64url').slice(0, 8);
  try {
    const response = await fetch(
      `https://res.cloudinary.com/${cloud}/image/authenticated/s--${signature}--/${path}`,
      { signal: AbortSignal.timeout(20000), redirect: 'error' },
    );
    if (response.status === 404) throw new NotFoundException('Image not found');
    if (!response.ok) throw new Error();
    // Uploaded files are capped at 5 MB; also bound the response while reading.
    if (!response.body) throw new Error();
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 5 * 1024 * 1024) throw new Error();
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    return Buffer.concat(chunks);
  } catch (error) {
    if (error instanceof NotFoundException) throw error;
    throw new ServiceUnavailableException('Image storage request failed');
  }
}
