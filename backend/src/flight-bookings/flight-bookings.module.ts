import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import {
  AirlineProfile,
  AirlineProfileSchema,
  Flight,
  FlightSchema,
} from '../flights/flights.schema';
import { Airport, AirportSchema } from '../reference-data/reference.schema';
import { User, UserSchema } from '../users/user.schema';
import { FlightBooking, FlightBookingSchema } from './flight-booking.schema';
import { FlightBookingsController } from './flight-bookings.controller';
import { FlightBookingsService } from './flight-bookings.service';
import { FlightBookingSummariesService } from './flight-booking-summaries.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: Flight.name, schema: FlightSchema },
      { name: Airport.name, schema: AirportSchema },
      { name: FlightBooking.name, schema: FlightBookingSchema },
      { name: AirlineProfile.name, schema: AirlineProfileSchema },
      // Self-contained: the module (and its standalone spec) works without the global DatabaseModule.
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [FlightBookingsController],
  providers: [FlightBookingsService, FlightBookingSummariesService],
  exports: [FlightBookingsService, FlightBookingSummariesService],
})
export class FlightBookingsModule {}