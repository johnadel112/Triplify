import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { Flight, FlightSchema } from '../flights/flights.schema';
import { Airport, AirportSchema } from '../reference-data/reference.schema';
import { FlightBooking, FlightBookingSchema } from './flight-booking.schema';
import { FlightBookingsController } from './flight-bookings.controller';
import { FlightBookingsService } from './flight-bookings.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: Flight.name, schema: FlightSchema },
      { name: Airport.name, schema: AirportSchema },
      { name: FlightBooking.name, schema: FlightBookingSchema },
    ]),
  ],
  controllers: [FlightBookingsController],
  providers: [FlightBookingsService],
  exports: [FlightBookingsService],
})
export class FlightBookingsModule {}