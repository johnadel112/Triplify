import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ErrorFilter, SafeLoggingInterceptor, validationPipe } from './common/http';
import { addResponseContracts } from './common/openapi';
import { NextFunction, Request, Response } from 'express';
export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService);
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.enableCors({
    origin: config.getOrThrow<string>('FRONTEND_URL').split(','),
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-Triplify-CSRF'],
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  });
  app.useGlobalPipes(validationPipe());
  app.useGlobalFilters(new ErrorFilter());
  app.useGlobalInterceptors(new SafeLoggingInterceptor());
  if (config.get('NODE_ENV') !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Triplify API')
        .setVersion('1.0')
        .setDescription(
          'Cookie authentication. Mutations require trusted Origin and X-Triplify-CSRF: 1. Errors contain statusCode, code, message and optional fields. Missing teammate adapters return 503.',
        )
        .addCookieAuth('access_token')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, addResponseContracts(document));
  }
}
