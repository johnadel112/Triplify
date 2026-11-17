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
import { FlightBookingsService } from './flight-bookings.service';
import { Flight } from '../flights/flights.schema';
import { FlightBooking } from './flight-booking.schema';

jest.setTimeout(600_000);

describe('flight booking concurrency', () => {
  let repl: MongoMemoryReplSet;
  let service: FlightBookingsService;
  let flights: Model<Flight>;
  let bookings: Model<FlightBooking>;
  let close: () => Promise<void>;

  beforeAll(async () => {
    repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const mod = await Test.createTestingModule({
      imports: [MongooseModule.forRoot(repl.getUri()), FlightBookingsModule],
    }).compile();
    await mod.init();
    service = mod.get(FlightBookingsService);
    flights = mod.get(getModelToken(Flight.name));
    bookings = mod.get(getModelToken(FlightBooking.name));
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
    return flights.create({
      flightNumber: `TP${Math.floor(Math.random() * 9000 + 1000)}`,
      airlineId: new Types.ObjectId(),
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
    const flight = await newFlight(1);
    const user = String(new Types.ObjectId());
    const draft = await service.createDraft(user, dtoFor(flight._id));
    await service.hold(user, String(draft._id));
    const res = await service.confirmPayment(String(draft._id), String(new Types.ObjectId()));
    expect(res.confirmed).toBe(true);
    expect(await seats(flight._id)).toBe(0);

    const results = await Promise.allSettled([
      service.cancel(user, String(draft._id)),
      service.cancel(user, String(draft._id)),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await seats(flight._id)).toBe(1);
  });
});
