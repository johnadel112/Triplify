import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { validateEnvironment } from './config/environment';

import { DatabaseModule } from './database/database.module';
import { IntegrationsModule } from './integrations/integrations.module';

import {
  CsrfGuard,
  JwtAuthGuard,
  Public,
  RolesGuard,
} from './auth/guards';

import { CommonModule } from './common/common.module';
import { AccountsModule } from './auth/accounts.module';
import { AdminModule } from './admin/admin.module';
import { ReferenceDataModule } from './reference-data/reference-data.module';

import { FlightBookingsModule } from './flight-bookings/flight-bookings.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';
import { PaymentsModule } from './payments/payments.module';
import { HotelBookingsModule } from './hotel-bookings/hotel-bookings.module';
import { ItinerariesModule } from './itineraries/itineraries.module';

// Magdy's Hotels module
import { HotelsModule } from './hotels/hotels.module';

@ApiTags('Health')
@Controller('health')
class HealthController {
  @Public()
  @Get()
  @ApiOperation({
    summary: 'Non-sensitive liveness check',
  })
  health() {
    return { status: 'ok' };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),

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

    FlightBookingsModule,
    NotificationsModule,
    ReportsModule,
    PaymentsModule,
    HotelBookingsModule,
    ItinerariesModule,

    // Magdy's module
    HotelsModule,

    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 120,
      },
    ]),
  ],

  controllers: [HealthController],

  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],

  exports: [
    AccountsModule,
    NotificationsModule,
    ReportsModule,
    PaymentsModule,
    ItinerariesModule,
  ],
})
export class AppModule {}