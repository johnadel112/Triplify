import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CookieOptions, Response } from 'express';
@Injectable()
export class AuthCookies {
  constructor(private config: ConfigService) {}
  private options(path: string): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE') === 'true',
      sameSite: this.config.get<'lax' | 'strict' | 'none'>('COOKIE_SAME_SITE'),
      path,
      ...(this.config.get<string>('COOKIE_DOMAIN')
        ? { domain: this.config.get<string>('COOKIE_DOMAIN') }
        : {}),
    };
  }
  set(res: Response, tokens: { access: string; refresh: string }) {
    res.cookie('access_token', tokens.access, { ...this.options('/api'), maxAge: 10 * 60 * 1000 });
    res.cookie('refresh_token', tokens.refresh, {
      ...this.options('/api/auth'),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.setHeader('Cache-Control', 'no-store');
  }
  clear(res: Response) {
    res.clearCookie('access_token', this.options('/api'));
    res.clearCookie('refresh_token', this.options('/api/auth'));
  }
}
