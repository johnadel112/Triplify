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
import { RefundsService } from './refunds.service';
import { PaymentsController } from './payments.controller';
import { PoliciesController } from './policies.controller';
import { RefundsController } from './refunds.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { FlightBooking, FlightBookingSchema } from '../flight-bookings/flight-booking.schema';
import { HotelBooking, HotelBookingSchema } from '../hotel-bookings/hotel-booking.schema';
import { BookingPaymentSource } from './booking-payment-source';

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
  ],
  controllers: [PaymentsController, PoliciesController, RefundsController],
  providers: [PaymentsService, RefundsService, BookingPaymentSource],
  exports: [PaymentsService, RefundsService],
})
export class PaymentsModule {}

