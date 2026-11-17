import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { Payment, PaymentSchema } from '../payments/payments.schema';
import { HotelBookingLifecycle } from './hotel-booking-lifecycle';
import {
  HotelBooking,
  HotelBookingSchema,
  RoomNightLock,
  RoomNightLockSchema,
} from './hotel-booking.schema';
import { HotelBookingsController } from './hotel-bookings.controller';
import { HotelBookingsService } from './hotel-bookings.service';
import { HOTEL_INVENTORY, unavailableHotelInventory } from './hotel-inventory.port';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { Review, ReviewSchema } from './review.schema';

/**
 * Hotel bookings and reviews: HTL-16, HTL-17, HTL-18, HTL-20, HTL-21, HTL-23, HTL-24, GEN-11.
 *
 * HOTEL_INVENTORY defaults to a 503 adapter. When the hotels module (HTL-01..15) exists, import
 * it here and replace the provider with `{ provide: HOTEL_INVENTORY, useExisting: <adapter> }`.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HotelBooking.name, schema: HotelBookingSchema },
      { name: RoomNightLock.name, schema: RoomNightLockSchema },
      { name: Review.name, schema: ReviewSchema },
      // Read-only: payment verification before confirmation. Same schema object as PaymentsModule.
      { name: Payment.name, schema: PaymentSchema },
    ]),
    PaymentsModule,
    NotificationsModule,
  ],
  controllers: [HotelBookingsController, ReviewsController],
  providers: [
    HotelBookingsService,
    ReviewsService,
    HotelBookingLifecycle,
    { provide: HOTEL_INVENTORY, useValue: unavailableHotelInventory },
  ],
  exports: [HotelBookingsService, ReviewsService],
})
export class HotelBookingsModule {}
