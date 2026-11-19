import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { FlightBooking, FlightBookingSchema } from '../flight-bookings/flight-booking.schema';
import { HotelBooking, HotelBookingSchema } from '../hotel-bookings/hotel-booking.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { Payment, PaymentSchema, Refund, RefundSchema } from './payments.schema';
import { RefundBookingSource } from './refund-booking-source';
import { RefundsService } from './refunds.service';

@Module({
  imports: [ConfigModule, NotificationsModule, MongooseModule.forFeature([
    { name: Payment.name, schema: PaymentSchema }, { name: Refund.name, schema: RefundSchema },
    { name: FlightBooking.name, schema: FlightBookingSchema }, { name: HotelBooking.name, schema: HotelBookingSchema },
  ])],
  providers: [RefundsService, RefundBookingSource],
  exports: [RefundsService],
})
export class RefundsModule {}
