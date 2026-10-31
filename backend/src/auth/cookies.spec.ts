import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AuthCookies } from './cookies';
describe('Production cookie policy', () => {
  it('uses secure HttpOnly cookies with matching clear paths', () => {
    const policy = new AuthCookies(
      new ConfigService({ COOKIE_SECURE: 'true', COOKIE_SAME_SITE: 'none' }),
    );
    const cookie = jest.fn();
    const clearCookie = jest.fn();
    const setHeader = jest.fn();
    const response = { cookie, clearCookie, setHeader } as unknown as Response;
    policy.set(response, { access: 'test-access', refresh: 'test-refresh' });
    policy.clear(response);
    expect(cookie).toHaveBeenCalledWith(
      'access_token',
      'test-access',
      expect.objectContaining({ secure: true, httpOnly: true, sameSite: 'none', path: '/api' }),
    );
    expect(cookie).toHaveBeenCalledWith(
      'refresh_token',
      'test-refresh',
      expect.objectContaining({ secure: true, httpOnly: true, path: '/api/auth' }),
    );
    expect(clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      expect.objectContaining({ path: '/api/auth', secure: true }),
    );
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
});
