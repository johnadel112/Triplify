import {
  ArgumentsHost,
  BadRequestException,
  CallHandler,
  Catch,
  ExceptionFilter,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
  PipeTransform,
  ValidationPipe,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { finalize } from 'rxjs';
import { Principal } from './domain';
export interface AuthRequest extends Request {
  principal: Principal;
}
export const validationPipe = () =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        fields: errors.map((e) => ({
          field: e.property,
          messages: Object.values(e.constraints ?? {}),
        })),
      }),
  });
@Injectable()
export class ObjectIdPipe implements PipeTransform<string> {
  transform(value: string) {
    if (!/^[a-f\d]{24}$/i.test(value)) throw new BadRequestException('Invalid ObjectId');
    return value;
  }
}
@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    let status = 500;
    let body: Record<string, unknown> = {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    };
    if (error instanceof HttpException) {
      status = error.getStatus();
      const data = error.getResponse();
      body = typeof data === 'string' ? { message: data } : (data as Record<string, unknown>);
    } else if (typeof error === 'object' && error && 'code' in error && error.code === 11000) {
      status = 409;
      body = { code: 'EMAIL_OR_KEY_EXISTS', message: 'Email or unique key already exists' };
    }
    response
      .status(status)
      .json({ statusCode: status, code: body.code ?? `HTTP_${status}`, ...body });
  }
}
@Injectable()
export class SafeLoggingInterceptor implements NestInterceptor {
  private logger = new Logger('HTTP');
  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest<Request>();
    const started = Date.now();
    // Route template only: never query, headers, bodies, credentials or raw user paths.
    return next
      .handle()
      .pipe(
        finalize(() =>
          this.logger.log({
            method: req.method,
            route: (req.route as { path?: string } | undefined)?.path ?? 'unmatched',
            durationMs: Date.now() - started,
          }),
        ),
      );
  }
}
