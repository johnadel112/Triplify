import { Model, Types } from 'mongoose';
import { FlightBooking } from '../flight-bookings/flight-booking.schema';
import { HotelBooking } from '../hotel-bookings/hotel-booking.schema';
import { BookingPaymentSource } from './booking-payment-source';
import { BookingType } from './payments.constants';

describe('Authoritative booking prices (PAY-01, PAY-04)', () => {
  const userId = new Types.ObjectId().toString();
  const bookingId = new Types.ObjectId().toString();
  const pending = { status: 'PENDING', totalPrice: 19.99, currency: 'USD', holdExpiresAt: new Date(Date.now() + 600000) };
  let flight: jest.Mock;
  let hotel: jest.Mock;
  let source: BookingPaymentSource;
  beforeEach(() => {
    flight = jest.fn().mockReturnValue({ lean: async () => pending });
    hotel = jest.fn().mockReturnValue({ lean: async () => ({ ...pending, status: 'PENDING_PAYMENT', totalAmountCents: 12345 }) });
    source = new BookingPaymentSource({ findOne: flight } as unknown as Model<FlightBooking>, { findOne: hotel } as unknown as Model<HotelBooking>);
  });
  it('uses flight snapshots and scopes the database query to the owner', async () => {
    await expect(source.payable(userId, BookingType.FLIGHT, bookingId)).resolves.toEqual({ amountCents: 1999, currency: 'USD' });
    expect(flight).toHaveBeenCalledWith({ _id: new Types.ObjectId(bookingId), userId: new Types.ObjectId(userId) });
  });
  it('uses integer hotel cents', async () => {
    await expect(source.payable(userId, BookingType.HOTEL, bookingId)).resolves.toEqual({ amountCents: 12345, currency: 'USD' });
  });
  it('does not disclose a missing or unowned booking', async () => {
    flight.mockReturnValue({ lean: async () => null });
    await expect(source.payable(userId, BookingType.FLIGHT, bookingId)).rejects.toThrow('Booking not found');
  });
  it.each([
    { status: 'CANCELLED' }, { status: 'CONFIRMED' }, { status: 'DRAFT' },
    { paymentId: new Types.ObjectId() }, { holdExpiresAt: new Date(0) },
    { holdExpiresAt: undefined }, { currency: 'EUR' }, { totalPrice: -1 },
    { totalPrice: NaN }, { totalPrice: 1.234 }, { totalPrice: Number.MAX_SAFE_INTEGER },
  ])('rejects nonpayable or invalid snapshot %j', async (change) => {
    flight.mockReturnValue({ lean: async () => ({ ...pending, ...change }) });
    await expect(source.payable(userId, BookingType.FLIGHT, bookingId)).rejects.toThrow();
  });
  it('rejects malformed references and unknown types before lookup', async () => {
    await expect(source.payable(userId, BookingType.FLIGHT, 'bad')).rejects.toThrow('Invalid booking reference');
    await expect(source.payable(userId, 'TRAIN' as BookingType, bookingId)).rejects.toThrow('Invalid booking type');
    expect(flight).not.toHaveBeenCalled();
    expect(hotel).not.toHaveBeenCalled();
  });
});
