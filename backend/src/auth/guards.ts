import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthRequest } from '../common/http';
import { UserRole } from '../common/domain';
export const Public = () => SetMetadata('public', true);
export const AllowPasswordChange = () => SetMetadata('allowPasswordChange', true);
export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles);
export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthRequest>().principal,
);
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private auth: AuthService,
    private reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>('public', [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const req = context.switchToHttp().getRequest<AuthRequest>();
    req.principal = await this.auth.authenticate(
      (req.cookies as Record<string, string> | undefined)?.access_token,
    );
    if (
      req.principal.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>('allowPasswordChange', [
        context.getHandler(),
        context.getClass(),
      ])
    )
      throw new ForbiddenException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Change your temporary password before continuing',
      });
    return true;
  }
}
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<UserRole[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && !roles.includes(context.switchToHttp().getRequest<AuthRequest>().principal?.role))
      throw new ForbiddenException('Role not permitted');
    return true;
  }
}
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private config: ConfigService) {}
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
    // Exact Origin plus a non-simple custom header forces browser preflight, including login.
    const origins = this.config.getOrThrow<string>('FRONTEND_URL').split(',');
    if (
      !req.headers.origin ||
      !origins.includes(req.headers.origin) ||
      req.headers['x-triplify-csrf'] !== '1'
    )
      throw new ForbiddenException({
        code: 'CSRF_REJECTED',
        message: 'Trusted Origin and X-Triplify-CSRF: 1 required',
      });
    return true;
  }
}
