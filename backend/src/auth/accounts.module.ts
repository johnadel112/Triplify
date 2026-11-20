import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthCookies } from './cookies';
import { AuthController } from './auth.controller';
import { UsersService } from '../users/users.service';
import { UsersController } from '../users/users.controller';
import { MailModule } from '../mail/mail.module';
import { EmailAuthController } from './email-auth.controller';
import { EmailAuthService } from './email-auth.service';
@Module({
  imports: [
    MailModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: { algorithm: 'HS256', issuer: 'triplify', audience: 'triplify-api' },
        verifyOptions: { issuer: 'triplify', audience: 'triplify-api' },
      }),
    }),
  ],
  controllers: [AuthController, UsersController, EmailAuthController],
  providers: [AuthService, AuthCookies, UsersService, EmailAuthService],
  exports: [AuthService, AuthCookies, UsersService],
})
export class AccountsModule {}
