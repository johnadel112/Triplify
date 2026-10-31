import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { CredentialsDto, RegisterDto } from '../common/dto';
import { Principal } from '../common/domain';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { AuthCookies } from './cookies';
import { AllowPasswordChange, CurrentUser, Public } from './guards';
@ApiTags('Authentication')
@ApiCookieAuth()
@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private cookies: AuthCookies,
    private users: UsersService,
  ) {}
  @Public()
  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Register a normal user; consent is mandatory' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }
  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Login; sets HttpOnly access and refresh cookies' })
  async login(@Body() dto: CredentialsDto, @Res({ passthrough: true }) res: Response) {
    const { access, refresh, ...result } = await this.auth.login(dto);
    this.cookies.set(res, { access, refresh });
    return result;
  }
  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate refresh token; concurrent refresh/reuse revokes session' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      this.cookies.set(
        res,
        await this.auth.refresh((req.cookies as Record<string, string> | undefined)?.refresh_token),
      );
      return { success: true };
    } catch (error) {
      this.cookies.clear(res);
      throw error;
    }
  }
  @AllowPasswordChange()
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke current session' })
  async logout(@CurrentUser() actor: Principal, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(actor);
    this.cookies.clear(res);
    return { success: true };
  }
  @AllowPasswordChange()
  @Get('me')
  @ApiOperation({ summary: 'Get authoritative account role and password-change requirement' })
  me(@CurrentUser() actor: Principal) {
    return this.users.me(actor);
  }
}
