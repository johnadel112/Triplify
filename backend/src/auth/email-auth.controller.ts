import { Body, Controller, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Public } from './guards';
import { Principal } from '../common/domain';
import { EmailAuthService } from './email-auth.service';
import {
  EmailPreferenceDto,
  EmailRequestDto,
  EmailTokenDto,
  ResetPasswordDto,
} from './email-auth.dto';
@ApiTags('Email authentication')
@Controller('auth')
@Throttle({ default: { limit: 5, ttl: 60000 } })
export class EmailAuthController {
  constructor(private service: EmailAuthService) {}
  @Public()
  @Post('request-verification')
  @HttpCode(200)
  @ApiOperation({ summary: 'Request a single-use email verification link' })
  requestVerification(@Body() dto: EmailRequestDto) {
    return this.service.request(dto.email, 'verify');
  }
  @Public()
  @Post('verify-email')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify an email using the emailed token' })
  verify(@Body() dto: EmailTokenDto) {
    return this.service.verify(dto.token);
  }
  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Request a password recovery email without disclosing account existence',
  })
  forgot(@Body() dto: EmailRequestDto) {
    return this.service.request(dto.email, 'reset');
  }
  @Public()
  @Post('reset-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reset password with a single-use token and invalidate all sessions' })
  reset(@Body() dto: ResetPasswordDto) {
    return this.service.reset(dto.token, dto.newPassword);
  }
  @ApiCookieAuth()
  @Patch('email-notifications')
  @ApiOperation({ summary: 'Enable or disable optional notification emails' })
  preference(@CurrentUser() actor: Principal, @Body() dto: EmailPreferenceDto) {
    return this.service.preference(actor.id, dto.enabled);
  }
}
