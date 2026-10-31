import { Body, Controller, Get, HttpCode, Patch, Post, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AllowPasswordChange, CurrentUser, Roles } from '../auth/guards';
import { AuthCookies } from '../auth/cookies';
import { Principal, UserRole } from '../common/domain';
import { ConfirmationDto, PasswordDto, ProfileDto } from '../common/dto';
import { UsersService } from './users.service';
@ApiTags('Users')
@ApiCookieAuth()
@Controller('users')
export class UsersController {
  constructor(
    private users: UsersService,
    private cookies: AuthCookies,
  ) {}
  @Get('me') @ApiOperation({ summary: 'Read own profile' }) me(@CurrentUser() actor: Principal) {
    return this.users.me(actor);
  }
  @Patch('me') @ApiOperation({ summary: 'Edit own name, phone or supported currency' }) update(
    @CurrentUser() actor: Principal,
    @Body() dto: ProfileDto,
  ) {
    return this.users.update(actor, dto);
  }
  @AllowPasswordChange()
  @Patch('me/password')
  @ApiOperation({ summary: 'Change password and revoke all sessions, including current' })
  async password(
    @CurrentUser() actor: Principal,
    @Body() dto: PasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.users.password(actor, dto);
    this.cookies.clear(res);
    return result;
  }
  @Roles(UserRole.USER)
  @Post('me/deactivate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Deactivate after authoritative booking eligibility check' })
  async deactivate(
    @CurrentUser() actor: Principal,
    @Body() _dto: ConfirmationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.users.deactivate(actor);
    this.cookies.clear(res);
    return result;
  }
}
