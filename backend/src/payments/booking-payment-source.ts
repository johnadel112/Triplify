import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FlightBooking } from '../flight-bookings/flight-booking.schema';
import { HotelBooking } from '../hotel-bookings/hotel-booking.schema';
import { BookingType, PLATFORM_CURRENCY } from './payments.constants';

/** Reads the immutable price agreed at booking time, never the current search price. */
@Injectable()
export class BookingPaymentSource {
  constructor(
    @InjectModel(FlightBooking.name) private readonly flights: Model<FlightBooking>,
    @InjectModel(HotelBooking.name) private readonly hotels: Model<HotelBooking>,
  ) {}

  async payable(userId: string, bookingType: BookingType, bookingId: string) {
    if (!Types.ObjectId.isValid(bookingId) || !Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid booking reference');
    }
    const filter = { _id: new Types.ObjectId(bookingId), userId: new Types.ObjectId(userId) };
    let amountCents: number;
    let currency: string;
    let expiresAt: Date | undefined;
    if (bookingType === BookingType.FLIGHT) {
      const booking = await this.flights.findOne(filter).lean();
      if (!booking) throw new NotFoundException('Booking not found');
      if (booking.status !== 'PENDING' || booking.paymentId) throw new ConflictException('Booking is not payable');
      const rawCents = booking.totalPrice * 100;
      amountCents = Math.round(rawCents);
      if (Math.abs(rawCents - amountCents) > 0.000001) throw new ConflictException('Invalid booking price precision');
      currency = booking.currency;
      expiresAt = booking.holdExpiresAt;
    } else if (bookingType === BookingType.HOTEL) {
      const booking = await this.hotels.findOne(filter).lean();
      if (!booking) throw new NotFoundException('Booking not found');
      if (booking.status !== 'PENDING_PAYMENT' || booking.paymentId) throw new ConflictException('Booking is not payable');
      amountCents = booking.totalAmountCents;
      currency = booking.currency;
      expiresAt = booking.holdExpiresAt;
    } else {
      throw new BadRequestException('Invalid booking type');
    }
    if (!expiresAt || expiresAt.getTime() <= Date.now()) throw new ConflictException('Booking hold expired');
    if (currency !== PLATFORM_CURRENCY || !Number.isSafeInteger(amountCents) || amountCents <= 0) {
      throw new ConflictException('Invalid booking price or currency');
    }
    return { amountCents, currency };
  }
}
