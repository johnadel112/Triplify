import { validateEnvironment } from './environment';

describe('cloud provider configuration', () => {
  const base = { MONGODB_URI: 'mongodb://localhost/test', JWT_ACCESS_SECRET: 'a'.repeat(40),
    FRONTEND_URL: 'http://localhost:5173' };
  it('keeps local storage and disabled mail as development defaults', () => {
    expect(validateEnvironment(base)).toMatchObject({ MEDIA_STORAGE: 'local', MAIL_MODE: 'disabled' });
  });
  it('requires Resend credentials and sender', () => {
    expect(() => validateEnvironment({ ...base, MAIL_MODE: 'resend' })).toThrow('RESEND_API_KEY');
    expect(() => validateEnvironment({ ...base, MAIL_MODE: 'resend', RESEND_API_KEY: 'key' })).toThrow('MAIL_FROM');
    expect(validateEnvironment({ ...base, MAIL_MODE: 'resend', RESEND_API_KEY: 'key', MAIL_FROM: 'sender@example.com' }).MAIL_MODE).toBe('resend');
  });
  it('requires Cloudinary credentials and a safe cloud name', () => {
    expect(() => validateEnvironment({ ...base, MEDIA_STORAGE: 'cloudinary' })).toThrow('CLOUDINARY_CLOUD_NAME');
    const cloud = { ...base, MEDIA_STORAGE: 'cloudinary', CLOUDINARY_CLOUD_NAME: 'demo',
      CLOUDINARY_API_KEY: 'key', CLOUDINARY_API_SECRET: 'secret' };
    expect(validateEnvironment(cloud).MEDIA_STORAGE).toBe('cloudinary');
    expect(() => validateEnvironment({ ...cloud, CLOUDINARY_CLOUD_NAME: '../other' })).toThrow('Invalid CLOUDINARY_CLOUD_NAME');
  });
  it('rejects unknown providers', () => {
    expect(() => validateEnvironment({ ...base, MEDIA_STORAGE: 'other' })).toThrow('MEDIA_STORAGE');
    expect(() => validateEnvironment({ ...base, MAIL_MODE: 'other' })).toThrow('MAIL_MODE');
  });
});
