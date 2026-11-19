import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FlightBooking } from '../flight-bookings/flight-booking.schema';
import { HotelBooking } from '../hotel-bookings/hotel-booking.schema';
import { BookingType } from './payments.constants';

@Injectable()
export class RefundBookingSource {
  constructor(
    @InjectModel(FlightBooking.name) private readonly flights: Model<FlightBooking>,
    @InjectModel(HotelBooking.name) private readonly hotels: Model<HotelBooking>,
  ) {}

  async recordStatus(type: BookingType, id: string, status: string, refundId: string) {
    if (type === BookingType.FLIGHT) {
      await this.flights.updateOne({ _id: id }, { $set: { refundStatus: status, refundId } });
    } else {
      await this.hotels.updateOne({ _id: id, status: 'CANCELLED' }, {
        $set: { 'cancellation.refundStatus': status, 'cancellation.refundId': refundId },
      });
    }
  }

  async quote(userId: string, type: BookingType, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Booking not found');
    const filter = { _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) };
    if (type === BookingType.FLIGHT) {
      const booking = await this.flights.findOne(filter).lean();
      if (!booking) throw new NotFoundException('Booking not found');
      if (!['CANCELLED', 'EXPIRED'].includes(booking.status)) throw new ConflictException('Cancel the booking before requesting a refund');
      return { amountCents: Math.round((booking.status === 'EXPIRED' ? booking.totalPrice : booking.refundAmount ?? 0) * 100),
        totalCents: Math.round(booking.totalPrice * 100), currency: booking.currency,
        reason: booking.status === 'EXPIRED' ? 'PROVIDER_CANCELLATION' as const : 'USER_CANCELLATION' as const };
    }
    if (type !== BookingType.HOTEL) throw new NotFoundException('Booking not found');
    const booking = await this.hotels.findOne(filter).lean();
    if (!booking) throw new NotFoundException('Booking not found');
    if (!['CANCELLED', 'EXPIRED'].includes(booking.status)) throw new ConflictException('Cancel the booking before requesting a refund');
    return { amountCents: booking.status === 'EXPIRED' ? booking.totalAmountCents : booking.cancellation?.refundAmountCents ?? 0,
      totalCents: booking.totalAmountCents, currency: booking.currency,
      reason: booking.status === 'EXPIRED' ? 'PROVIDER_CANCELLATION' as const : 'USER_CANCELLATION' as const };
  }
}
