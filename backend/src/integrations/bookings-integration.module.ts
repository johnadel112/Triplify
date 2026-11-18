import { Global, Module } from '@nestjs/common';
import { FlightBookingsModule } from '../flight-bookings/flight-bookings.module';
import { HotelBookingsModule } from '../hotel-bookings/hotel-bookings.module';
import { BookingsCompositeAdapter } from './bookings.adapter';
import { BOOKING_ACCESS, BOOKING_READER } from './contracts';

/**
 * Provides the real BOOKING_ACCESS (account deactivation, ACC-12) and BOOKING_READER
 * (admin booking overview, ACC-17) to the accounts and admin modules.
 */
@Global()
@Module({
  imports: [HotelBookingsModule, FlightBookingsModule],
  providers: [
    BookingsCompositeAdapter,
    { provide: BOOKING_ACCESS, useExisting: BookingsCompositeAdapter },
    { provide: BOOKING_READER, useExisting: BookingsCompositeAdapter },
  ],
  exports: [BOOKING_ACCESS, BOOKING_READER],
})
export class BookingsIntegrationModule {}
