import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { validateEnvironment } from './config/environment';
import { DatabaseModule } from './database/database.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { CsrfGuard, JwtAuthGuard, Public, RolesGuard } from './auth/guards';
import { CommonModule } from './common/common.module';
import { AccountsModule } from './auth/accounts.module';
import { AdminModule } from './admin/admin.module';
import { ReferenceDataModule } from './reference-data/reference-data.module';
@ApiTags('Health')
@Controller('health')
class HealthController {
  @Public() @Get() @ApiOperation({ summary: 'Non-sensitive liveness check' }) health() {
    return { status: 'ok' };
  }
}
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
        autoIndex: true,
        serverSelectionTimeoutMS: 10000,
      }),
    }),
    DatabaseModule,
    CommonModule,
    IntegrationsModule,
    AccountsModule,
    AdminModule,
    ReferenceDataModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AccountsModule],
})
export class AppModule {}
