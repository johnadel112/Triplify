import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FlightsController } from './flights.controller';
import { AirlinesController } from './airlines.controller';
import { FlightsService } from './flights.service';
import { Flight, FlightSchema, AirlineProfile, AirlineProfileSchema } from './flights.schema';
import { Airport, AirportSchema } from '../reference-data/reference.schema';
import { IntegrationsModule } from '../integrations/integrations.module';
import { AccountsModule } from '../auth/accounts.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FlightBookingsModule } from '../flight-bookings/flight-bookings.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Flight.name, schema: FlightSchema },
      { name: AirlineProfile.name, schema: AirlineProfileSchema },
      { name: Airport.name, schema: AirportSchema },
    ]),
    IntegrationsModule,
    AccountsModule,
    NotificationsModule,
    FlightBookingsModule,
  ],
  controllers: [FlightsController, AirlinesController],
  providers: [FlightsService],
  exports: [FlightsService],
})
export class FlightsModule {}
