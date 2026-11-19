jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_MINUTE: '* * * * *' },
  ScheduleModule: { forRoot: () => ({ module: class ScheduleModuleStub {} }) },
}));

import { Test } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { FlightBookingsModule } from './flight-bookings.module';
import { FlightBookingsService, REFUNDS_PORT } from './flight-bookings.service';
import { AirlineProfile, Flight } from '../flights/flights.schema';
import { FlightBooking } from './flight-booking.schema';
import { User } from '../users/user.schema';
import { Payment } from '../payments/payments.schema';
import { Notification } from '../notifications/notifications.schema';

jest.setTimeout(600_000);

describe('flight booking concurrency', () => {
  let repl: MongoMemoryReplSet;
  let service: FlightBookingsService;
  let flights: Model<Flight>;
  let airlines: Model<AirlineProfile>;
  let bookings: Model<FlightBooking>;
  let users: Model<User>;
  let payments: Model<Payment>;
  let notifications: Model<Notification>;
  let close: () => Promise<void>;

  beforeAll(async () => {
    repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const mod = await Test.createTestingModule({
      imports: [MongooseModule.forRoot(repl.getUri()), FlightBookingsModule],
    }).overrideProvider(REFUNDS_PORT).useValue({ requestRefund: jest.fn().mockResolvedValue(undefined) }).compile();
    await mod.init();
    service = mod.get(FlightBookingsService);
    flights = mod.get(getModelToken(Flight.name));
    airlines = mod.get(getModelToken(AirlineProfile.name));
    bookings = mod.get(getModelToken(FlightBooking.name));
    users = mod.get(getModelToken(User.name));
    payments = mod.get(getModelToken(Payment.name));
    notifications = mod.get(getModelToken(Notification.name));
    close = async () => {
      await mod.close();
      await repl.stop();
    };
  });
  afterAll(async () => close());

  const passenger = {
    firstName: 'A', lastName: 'B', dateOfBirth: '1995-01-01', passportNumber: 'X1', type: 'adult' as const,
  };

  const newFlight = async (seatCount: number) => {
    const dep = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const airline = await airlines.create({ moderatorId: new Types.ObjectId(), name: 'Fixture Air', active: true, verified: true });
    return flights.create({
      flightNumber: `TP${Math.floor(Math.random() * 9000 + 1000)}`,
      airlineId: airline._id,
      departureAirport: 'CAI',
      arrivalAirport: 'DXB',
      departureTimeUtc: dep,
      arrivalTimeUtc: new Date(dep.getTime() + 4 * 3600 * 1000),
      departureDate: dep.toISOString().slice(0, 10),
      cabins: { economy: { seatCount, price: 100 } },
      extraBaggagePricePerKg: 5,
      cancellationTiers: [{ hoursBeforeDeparture: 48, refundPercentage: 100 }],
    });
  };
  const seats = async (id: unknown) => {
    const f = (await flights.findById(id).lean()) as unknown as { cabins: Record<string, { seatCount: number }> };
    return f.cabins['economy'].seatCount;
  };
  const dtoFor = (flightId: unknown) => ({
    legs: [{ flightId: String(flightId), cabinClass: 'economy' }],
    passengers: [passenger],
  });

  async function paidHold() {
    const flight = await newFlight(1);
    const user = await users.create({ name: 'Traveler', email: `${new Types.ObjectId()}@example.test`, passwordHash: 'test-only' });
    const draft = await service.createDraft(String(user._id), dtoFor(flight._id));
    await service.hold(String(user._id), String(draft._id));
    const payment = await payments.create({ bookingId: String(draft._id), bookingType: 'FLIGHT', userId: user._id,
      amount: 100, currency: 'USD', status: 'SUCCEEDED', stripePaymentIntentId: `pi_${draft._id}`, stripeClientSecret: 'test-only' });
    return { flight, user, draft, payment };
  }

  it('only one of two users gets the last seat, and expiry releases it exactly once', async () => {
    const flight = await newFlight(1);
    const dto = dtoFor(flight._id);
    const u1 = String(new Types.ObjectId());
    const u2 = String(new Types.ObjectId());
    const [d1, d2] = await Promise.all([service.createDraft(u1, dto), service.createDraft(u2, dto)]);

    const results = await Promise.allSettled([
      service.hold(u1, String(d1._id)),
      service.hold(u2, String(d2._id)),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(await seats(flight._id)).toBe(0);

    await bookings.updateMany({ status: 'PENDING' }, { $set: { holdExpiresAt: new Date(Date.now() - 1000) } });
    await Promise.all([service.expireDue(), service.expireDue()]); // run twice, concurrently
    expect(await seats(flight._id)).toBe(1); // released once, not twice
  });

  it('cancelling the same confirmed booking twice releases the seat only once', async () => {
    const { flight, user: account, draft, payment } = await paidHold();
    const user = String(account._id);
    const res = await service.confirmPayment(String(draft._id), String(payment._id));
    expect(res.confirmed).toBe(true);
    expect(await seats(flight._id)).toBe(0);

    const results = await Promise.allSettled([
      service.cancel(user, String(draft._id)),
      service.cancel(user, String(draft._id)),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await seats(flight._id)).toBe(1);
  });

  it('concurrent duplicate confirmations persist one notification and keep the held seat', async () => {
    const { draft, payment, flight } = await paidHold();
    const results = await Promise.all([service.confirmPayment(String(draft._id), String(payment._id)), service.confirmPayment(String(draft._id), String(payment._id))]);
    expect(results.every(r => r.confirmed)).toBe(true);
    expect(await notifications.countDocuments({ 'metadata.bookingId': String(draft._id) })).toBe(1);
    expect(await seats(flight._id)).toBe(0);
  });

  it('rejects failed and mismatched payments without confirming', async () => {
    const { draft, payment } = await paidHold();
    for (const change of [{ status: 'FAILED' }, { status: 'SUCCEEDED', amount: 1 }, { amount: 100, userId: new Types.ObjectId() }]) {
      await payments.updateOne({ _id: payment._id }, { $set: change });
      await expect(service.confirmPayment(String(draft._id), String(payment._id))).rejects.toThrow('Payment is not verified');
    }
    expect((await bookings.findById(draft._id))?.status).toBe('PENDING');
  });

  it('an expired hold cannot be confirmed while concurrent expiry releases seats once', async () => {
    const { draft, payment, flight } = await paidHold();
    await bookings.updateOne({ _id: draft._id }, { $set: { holdExpiresAt: new Date(0) } });
    const [result] = await Promise.all([
      service.confirmPayment(String(draft._id), String(payment._id)), service.expireOne(draft._id), service.expireOne(draft._id),
    ]);
    expect(result.confirmed).toBe(false);
    expect((await bookings.findById(draft._id))?.status).toBe('EXPIRED');
    expect(await seats(flight._id)).toBe(1);
  });

  it('inactive accounts cannot confirm a paid hold', async () => {
    const { draft, payment, user } = await paidHold();
    await users.updateOne({ _id: user._id }, { $set: { status: 'DEACTIVATED' } });
    await expect(service.confirmPayment(String(draft._id), String(payment._id))).resolves.toMatchObject({ confirmed: false, reason: 'ACCOUNT_NOT_ACTIVE' });
  });
});
