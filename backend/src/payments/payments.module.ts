import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Payment,
  PaymentSchema,
  PolicyAcceptance,
  PolicyAcceptanceSchema,
  Refund,
  RefundSchema,
} from './payments.schema';
import { PaymentsService } from './payments.service';
import { RefundsModule } from './refunds.module';
import { PaymentsController } from './payments.controller';
import { PoliciesController } from './policies.controller';
import { RefundsController } from './refunds.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { FlightBooking, FlightBookingSchema } from '../flight-bookings/flight-booking.schema';
import { HotelBooking, HotelBookingSchema } from '../hotel-bookings/hotel-booking.schema';
import { BookingPaymentSource } from './booking-payment-source';
import { FlightBookingsModule } from '../flight-bookings/flight-bookings.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: PolicyAcceptance.name, schema: PolicyAcceptanceSchema },
      { name: Refund.name, schema: RefundSchema },
      { name: FlightBooking.name, schema: FlightBookingSchema },
      { name: HotelBooking.name, schema: HotelBookingSchema },
    ]),
    NotificationsModule,
    RefundsModule,
    FlightBookingsModule,
  ],
  controllers: [PaymentsController, PoliciesController, RefundsController],
  providers: [PaymentsService, BookingPaymentSource],
  exports: [PaymentsService, RefundsModule],
})
export class PaymentsModule {}

