import { join } from 'path';
import { createHash } from 'crypto';
import type { Response as ExpressResponse } from 'express';
import { mediaDir, sendStoredImage, storeImages, removeImage, prepareImages } from './media';
import { readCloudImage } from './cloudinary';

describe('Cloudinary image storage', () => {
  const filename = '12345678-1234-1234-1234-123456789abc.png';
  const second = '12345678-1234-1234-1234-123456789abd.png';
  const originalEnv = { ...process.env };
  const id = `triplify/hotels/${filename.slice(0, -4)}`;
  let fetchMock: jest.SpyInstance;
  beforeEach(() => {
    Object.assign(process.env, { MEDIA_STORAGE: 'cloudinary', CLOUDINARY_CLOUD_NAME: 'demo',
      CLOUDINARY_API_KEY: 'test-key', CLOUDINARY_API_SECRET: 'test-secret' });
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => { process.env = { ...originalEnv }; jest.restoreAllMocks(); });
  const json = (value: unknown) => new Response(JSON.stringify(value));

  it('uploads authenticated assets and removes them when the database write rolls back', async () => {
    fetchMock.mockResolvedValueOnce(json({ public_id: id })).mockResolvedValueOnce(json({ result: 'ok' }));
    const rollback = await storeImages('hotels', [{ filename, data: Buffer.from('image') }]);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.cloudinary.com/v1_1/demo/image/upload');
    expect(options.body.get('type')).toBe('authenticated');
    expect(options.body.get('public_id')).toBe(id);
    expect(options.body.get('overwrite')).toBe('false');
    const timestamp = options.body.get('timestamp');
    expect(options.body.get('signature')).toBe(createHash('sha256')
      .update(`overwrite=false&public_id=${id}&timestamp=${timestamp}&type=authenticatedtest-secret`).digest('hex'));
    await rollback();
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/destroy$/);
    expect(fetchMock.mock.calls[1][1].body.get('invalidate')).toBe('true');
  });

  it('cleans up the batch, including a potentially accepted upload, after network failure', async () => {
    fetchMock.mockResolvedValueOnce(json({ public_id: id })).mockRejectedValueOnce(new Error('secret'))
      .mockImplementation(async () => json({ result: 'ok' }));
    await expect(storeImages('hotels', [filename, second].map(filename => ({ filename, data: Buffer.from('image') }))))
      .rejects.toThrow('Image storage request failed');
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/destroy'))).toHaveLength(2);
  });

  it('proxies signed authenticated bytes without exposing the Cloudinary URL or allowing caches', async () => {
    fetchMock.mockResolvedValue(new Response('image-bytes'));
    const res = { setHeader: jest.fn(), type: jest.fn().mockReturnThis(), send: jest.fn() };
    await sendStoredImage(res as unknown as ExpressResponse, join(mediaDir('hotels'), filename));
    expect(res.send).toHaveBeenCalledWith(Buffer.from('image-bytes'));
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    const path = `triplify/hotels/${filename}`;
    const signature = createHash('sha256').update(path + 'test-secret').digest('base64url').slice(0, 8);
    expect(fetchMock.mock.calls[0][0]).toBe(`https://res.cloudinary.com/demo/image/authenticated/s--${signature}--/${path}`);
  });

  it('rejects traversal before contacting storage', async () => {
    await expect(storeImages('../outside', [{ filename, data: Buffer.from('image') }])).rejects.toThrow('Image not found');
    await removeImage('hotels', '../secret');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('handles missing assets and oversized downloads', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response(Buffer.alloc(5 * 1024 * 1024 + 1)));
    await expect(readCloudImage('hotels', filename)).rejects.toThrow('Image not found');
    await expect(readCloudImage('hotels', filename)).rejects.toThrow('Image storage request failed');
  });

  it('checks actual buffer size, not only the declared upload size', () => {
    expect(() => prepareImages([{ buffer: Buffer.alloc(5 * 1024 * 1024 + 1), size: 1 } as Express.Multer.File]))
      .toThrow('Every image must be <= 5 MB');
  });
});
