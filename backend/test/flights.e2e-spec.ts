import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { Connection, Model, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { hash } from 'bcryptjs';
import { UserRole } from '../src/common/domain';
import { User } from '../src/users/user.schema';
import { Airport } from '../src/reference-data/reference.schema';
import { AirlineProfile, Flight } from '../src/flights/flights.schema';
import { configureApp } from '../src/bootstrap';
import { FlightBookingsService } from '../src/flight-bookings/flight-bookings.service';
import { FlightBooking } from '../src/flight-bookings/flight-booking.schema';
import { Notification } from '../src/notifications/notifications.schema';
import { RefundBookingSource } from '../src/payments/refund-booking-source';
import { BookingType } from '../src/payments/payments.constants';

/** Flight management and search (FLT-01, FLT-03..05, FLT-11) request validation. */
describe('Flights API validation (FLT-01, FLT-03, FLT-04, FLT-05, FLT-11)', () => {
  let mongo: MongoMemoryReplSet;
  let app: INestApplication;
  let users: Model<User>;
  let flights: Model<Flight>;
  let passwordHash: string;
  const password = 'Secure12345';
  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  const csrf = (t: request.Test) =>
    t.set('Origin', 'http://localhost:5173').set('X-Triplify-CSRF', '1');
  const post = (path: string, cookies: string[] = []) =>
    csrf(request(server()).post(`/api${path}`)).set('Cookie', cookies);
  const put = (path: string, cookies: string[] = []) =>
    csrf(request(server()).put(`/api${path}`)).set('Cookie', cookies);
  const patch = (path: string, cookies: string[] = []) =>
    csrf(request(server()).patch(`/api${path}`)).set('Cookie', cookies);
  const get = (path: string) => request(server()).get(`/api${path}`);

  const inDays = (days: number, time: string) =>
    `${new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)}T${time}`;

  async function moderator() {
    const providerId = new Types.ObjectId();
    const user = await users.create({
      name: 'Airline Mod',
      email: `${new Types.ObjectId().toString()}@example.com`,
      passwordHash,
      role: UserRole.AIRLINE_MODERATOR,
      providerId,
      providerType: 'AIRLINE',
    });
    await app.get<Model<AirlineProfile>>(getModelToken(AirlineProfile.name)).create({
      _id: providerId,
      moderatorId: user._id,
      name: 'Fixture Air',
      active: true,
      verified: true,
    });
    const response = await post('/auth/login').send({ email: user.email, password });
    expect(response.status).toBe(200);
    const cookies = (response.headers['set-cookie'] as unknown as string[]).map(
      (v) => v.split(';')[0],
    );
    return { user, cookies };
  }
  const validFlight = () => ({
    flightNumber: 'MS777',
    departureAirportCode: 'CAI',
    arrivalAirportCode: 'JFK',
    departureTimeLocal: inDays(20, '10:30'),
    arrivalTimeLocal: inDays(20, '18:45'),
    cabins: {
      economy: { seatCount: 2, price: 320, freeBags: 1, maxBagWeightKg: 23 },
      business: { seatCount: 1, price: 900, freeBags: 2, maxBagWeightKg: 32 },
    },
  });

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      binary: { version: process.env.MONGOMS_VERSION ?? '7.0.24' },
    });
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = mongo.getUri();
    process.env.JWT_ACCESS_SECRET = 'test-only-'.repeat(8);
    process.env.FRONTEND_URL = 'http://localhost:5173';
    process.env.COOKIE_SECURE = 'false';
    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(false);
    configureApp(app);
    await app.init();
    users = app.get(getModelToken(User.name));
    flights = app.get(getModelToken(Flight.name));
    const db = app.get<Connection>(getConnectionToken());
    await Promise.all(Object.values(db.models).map((model) => model.init()));
    passwordHash = await hash(password, 10);
  });

  beforeEach(async () => {
    app.get<ThrottlerStorageService>(ThrottlerStorage).onApplicationShutdown();
    const db = app.get<Connection>(getConnectionToken());
    await Promise.all(Object.values(db.models).map((model) => model.deleteMany({})));
    await app.get<Model<Airport>>(getModelToken(Airport.name)).insertMany([
      {
        iataCode: 'CAI',
        name: 'Cairo Intl',
        city: 'Cairo',
        country: 'EG',
        timeZone: 'Africa/Cairo',
      },
      {
        iataCode: 'JFK',
        name: 'JFK',
        city: 'New York',
        country: 'US',
        timeZone: 'America/New_York',
      },
    ]);
  });

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  it('creates a valid flight and rejects invalid or server-controlled fields', async () => {
    const mod = await moderator();
    const created = await post('/flights', mod.cookies).send(validFlight()).expect(201);
    expect(created.body).toMatchObject({ flightNumber: 'MS777', status: 'SCHEDULED' });
    expect(created.body.extraBaggagePricePerKg).toBe(0);

    for (const bad of [
      { ...validFlight(), departureAirportCode: 'cairo' },
      { ...validFlight(), departureTimeLocal: 'tomorrow' },
      { ...validFlight(), cabins: { firstClass: { seatCount: 5, price: 10 } } },
      { ...validFlight(), cabins: { economy: { seatCount: 0, price: 10 } } },
      { ...validFlight(), cabins: { economy: { seatCount: 2.5, price: 10 } } },
      { ...validFlight(), status: 'CANCELLED' },
      { ...validFlight(), airlineId: new Types.ObjectId().toString() },
    ])
      await post('/flights', mod.cookies).send(bad).expect(400);
    await post('/flights').send(validFlight()).expect(401);
  });

  it('updates only allowed fields, keeps omitted fields and allows sold-out cabins', async () => {
    const mod = await moderator();
    const created = await post('/flights', mod.cookies).send(validFlight()).expect(201);
    const id = created.body._id as string;
    await patch(`/flights/${id}`, mod.cookies).send({ status: 'CANCELLED' }).expect(400);
    await patch(`/flights/${id}`, mod.cookies).send({ hasConfirmedBookings: true }).expect(400);
    await patch(`/flights/${id}`, mod.cookies)
      .send({ airlineId: new Types.ObjectId().toString() })
      .expect(400);

    const updated = await patch(`/flights/${id}`, mod.cookies)
      .send({ cabins: { economy: { seatCount: 0, price: 350 } }, extraBaggagePricePerKg: 12 })
      .expect(200);
    // The cabin's baggage allowance and the untouched business cabin are kept.
    expect(updated.body.cabins.economy).toEqual({ seatCount: 0, price: 350, freeBags: 1, maxBagWeightKg: 23 });
    expect(updated.body.cabins.business).toMatchObject({ seatCount: 1, price: 900 });
    const stored = await flights.findById(id).lean();
    expect(stored).toMatchObject({
      flightNumber: 'MS777',
      departureAirport: 'CAI',
      status: 'SCHEDULED',
      extraBaggagePricePerKg: 12,
    });
    expect(stored?.departureTimeUtc).toBeInstanceOf(Date);

    const other = await moderator();
    await patch(`/flights/${id}`, other.cookies).send({ extraBaggagePricePerKg: 1 }).expect(403);
    await patch('/flights/not-an-id', mod.cookies).send({}).expect(400);
  });

  it('cannot take over another airline profile', async () => {
    const owner = await moderator();
    const attacker = await moderator();
    await patch('/flights/airline-profile', owner.cookies).send({ name: 'Nile Air' }).expect(200);
    await patch('/flights/airline-profile', attacker.cookies)
      .send({ name: 'Mine', moderatorId: owner.user.id as string })
      .expect(400);
    const renamed = await patch('/flights/airline-profile', owner.cookies)
      .send({ logoUrl: 'https://example.com/logo.png' })
      .expect(200);
    expect(renamed.body).toMatchObject({
      name: 'Nile Air',
      logoUrl: 'https://example.com/logo.png',
    });
  });

  it('searches by route and cabin and validates the query', async () => {
    const mod = await moderator();
    await post('/flights', mod.cookies).send(validFlight()).expect(201);
    const date = inDays(20, '00:00').slice(0, 10);
    const found = await get(`/flights/search?origin=CAI&destination=JFK&date=${date}`).expect(200);
    expect(found.body.outbound).toHaveLength(1);
    const business = await get(
      `/flights/search?origin=CAI&destination=JFK&cabinClass=business&passengers=2`,
    ).expect(200);
    expect(business.body.outbound).toHaveLength(0);
    await get('/flights/search?origin=CAI&destination=JFK&cabinClass=$where').expect(400);
    await get('/flights/search?origin=CAI').expect(400);
    await get('/flights/search?origin=CAI&destination=JFK&passengers=0').expect(400);
    await get(`/flights/${new Types.ObjectId().toString()}`).expect(404);
  });

  it('FLT-01: admin creates an airline, then its moderator manages it and adds flights', async () => {
    const admin = await users.create({
      name: 'Admin',
      email: `${new Types.ObjectId().toString()}@example.com`,
      passwordHash,
      role: UserRole.ADMIN,
    });
    const adminLogin = await post('/auth/login').send({ email: admin.email, password });
    const adminCookies = (adminLogin.headers['set-cookie'] as unknown as string[]).map(
      (v) => v.split(';')[0],
    );

    const airline = await post('/airlines', adminCookies).send({ name: 'Nile Air' }).expect(201);
    expect(airline.body).toMatchObject({ name: 'Nile Air', active: true });
    await get(`/airlines/${airline.body.id as string}`).expect(200);
    await post('/airlines', adminCookies).send({}).expect(400);
    await post('/airlines').send({ name: 'Anon Air' }).expect(401);

    const email = `${new Types.ObjectId().toString()}@example.com`;
    await post('/admin/moderators', adminCookies)
      .send({
        name: 'Nile Moderator',
        email,
        password: 'TempPass123',
        role: 'AIRLINE_MODERATOR',
        providerId: airline.body.id,
      })
      .expect(201);

    // First login with the temporary password must change it before anything else.
    const first = await post('/auth/login').send({ email, password: 'TempPass123' });
    const tempCookies = (first.headers['set-cookie'] as unknown as string[]).map(
      (v) => v.split(';')[0],
    );
    await patch('/users/me/password', tempCookies)
      .send({ currentPassword: 'TempPass123', newPassword: 'NewPass12345' })
      .expect(200);
    const login = await post('/auth/login').send({ email, password: 'NewPass12345' });
    const cookies = (login.headers['set-cookie'] as unknown as string[]).map(
      (v) => v.split(';')[0],
    );

    const profile = await patch('/flights/airline-profile', cookies)
      .send({ contactEmail: 'ops@nile.example.com' })
      .expect(200);
    expect(profile.body).toMatchObject({ name: 'Nile Air', contactEmail: 'ops@nile.example.com' });
    const flight = await post('/flights', cookies).send(validFlight()).expect(201);
    expect(String(flight.body.airlineId)).toBe(airline.body.id);

    // Another airline's moderator cannot take this profile.
    const other = await moderator();
    await patch('/flights/airline-profile', other.cookies).send({ name: 'Mine' }).expect(200);
    expect((await get(`/airlines/${airline.body.id as string}`)).body.name).toBe('Nile Air');
  });

  describe('FLT-06, FLT-29, FLT-30: provider cancellation, moderator views, searchable status', () => {
    const getAs = (path: string, cookies: string[]) =>
      request(server()).get(`/api${path}`).set('Cookie', cookies);

    async function bookingFor(
      flightId: string,
      status: 'CONFIRMED' | 'PENDING',
      firstName: string,
      cabinClass = 'economy',
    ) {
      const traveler = await users.create({
        name: firstName,
        email: `${new Types.ObjectId().toString()}@example.com`,
        passwordHash,
        role: UserRole.USER,
      });
      const departure = new Date(Date.now() + 20 * 86400000);
      return app.get<Model<FlightBooking>>(getModelToken(FlightBooking.name)).create({
        userId: traveler._id,
        reference: `T${new Types.ObjectId().toString().slice(-7).toUpperCase()}`,
        status,
        legs: [
          {
            flightId: new Types.ObjectId(flightId),
            flightNumber: 'MS777',
            cabinClass,
            departureAirport: 'CAI',
            arrivalAirport: 'JFK',
            departureTime: departure,
            arrivalTime: new Date(departure.getTime() + 8 * 3600000),
            farePerSeat: 320,
            baggageCost: 0,
            legTotal: 320,
          },
        ],
        passengers: [
          {
            firstName,
            lastName: 'Tester',
            dateOfBirth: new Date('1990-01-01'),
            passportNumber: 'P1',
            type: 'adult',
          },
        ],
        seatCount: 1,
        currency: 'USD',
        totalPrice: 320,
        firstDeparture: departure,
        lastDeparture: departure,
        holdExpiresAt: status === 'PENDING' ? new Date(Date.now() + 600000) : undefined,
      });
    }

    it("lists a flight's bookings and exports confirmed passengers only to its own airline", async () => {
      const mod = await moderator();
      const other = await moderator();
      const created = await post('/flights', mod.cookies).send(validFlight()).expect(201);
      const flightId = created.body._id as string;
      await bookingFor(flightId, 'CONFIRMED', 'Amira');
      await bookingFor(flightId, 'CONFIRMED', 'Omar', 'business');

      const list = await getAs(`/flights/${flightId}/bookings`, mod.cookies).expect(200);
      expect(list.body.total).toBe(2);
      expect(list.body.flight.seatsRemaining).toMatchObject({ economy: 2, business: 1 });
      expect(list.body.bookings.map((b: { cabinClass: string }) => b.cabinClass).sort()).toEqual([
        'business',
        'economy',
      ]);
      expect(list.body.bookings[0].passengers[0].name).toMatch(/Tester$/);

      const csv = await getAs(`/flights/${flightId}/passengers/export`, mod.cookies).expect(200);
      expect(csv.headers['content-type']).toMatch(/text\/csv/);
      expect(csv.text.split('\r\n').filter(Boolean)).toHaveLength(3);
      expect(csv.text).toContain('"Amira Tester"');

      await getAs(`/flights/${flightId}/bookings`, other.cookies).expect(403);
      await getAs(`/flights/${flightId}/passengers/export`, other.cookies).expect(403);
      await request(server()).get(`/api/flights/${flightId}/bookings`).expect(401);
    });

    it('cancels a Scheduled flight: bookings cancelled with full refund, holds released, users notified, hidden from search', async () => {
      const mod = await moderator();
      const other = await moderator();
      const created = await post('/flights', mod.cookies).send(validFlight()).expect(201);
      const flightId = created.body._id as string;
      const confirmed = await bookingFor(flightId, 'CONFIRMED', 'Laila');
      const held = await bookingFor(flightId, 'PENDING', 'Karim');
      const date = validFlight().departureTimeLocal.slice(0, 10);
      expect(
        (await get(`/flights/search?origin=CAI&destination=JFK&date=${date}`)).body.outbound,
      ).toHaveLength(1);

      await post(`/flights/${flightId}/cancel`, mod.cookies).send({}).expect(400);
      await post(`/flights/${flightId}/cancel`, other.cookies)
        .send({ confirmation: true })
        .expect(403);
      const result = await post(`/flights/${flightId}/cancel`, mod.cookies)
        .send({ confirmation: true })
        .expect(200);
      expect(result.body).toMatchObject({
        status: 'CANCELLED',
        cancelledBookings: 1,
        releasedHolds: 1,
        refundsRequested: 1,
      });

      expect((await flights.findById(flightId).lean())!.status).toBe('CANCELLED');
      const bookings = app.get<Model<FlightBooking>>(getModelToken(FlightBooking.name));
      expect(await bookings.findById(confirmed._id).lean()).toMatchObject({
        status: 'CANCELLED',
        cancelledBy: 'PROVIDER',
        refundAmount: 320,
        refundStatus: 'PENDING',
      });
      expect((await bookings.findById(held._id).lean())!.status).toBe('EXPIRED');
      const notes = app.get<Model<Notification>>(getModelToken(Notification.name));
      expect(
        await notes.countDocuments({ userId: confirmed.userId, type: 'BOOKING_CANCELLED' }),
      ).toBe(1);
      expect(await notes.countDocuments({ userId: held.userId, type: 'BOOKING_CANCELLED' })).toBe(
        1,
      );

      // PAY-03: the refund source treats it as a provider cancellation at 100%.
      const quote = await app
        .get(RefundBookingSource)
        .quote(String(confirmed.userId), BookingType.FLIGHT, String(confirmed._id));
      expect(quote).toMatchObject({ reason: 'PROVIDER_CANCELLATION', amountCents: 32000 });

      // FLT-30: no longer searchable, editable or cancellable.
      expect(
        (await get(`/flights/search?origin=CAI&destination=JFK&date=${date}`)).body.outbound,
      ).toHaveLength(0);
      await patch(`/flights/${flightId}`, mod.cookies)
        .send({ extraBaggagePricePerKg: 5 })
        .expect(409);
      await post(`/flights/${flightId}/cancel`, mod.cookies)
        .send({ confirmation: true })
        .expect(409);
    });

    it('does not return flights that have already departed in search', async () => {
      const mod = await moderator();
      const created = await post('/flights', mod.cookies).send(validFlight()).expect(201);
      await flights.updateOne(
        { _id: created.body._id },
        { $set: { departureTimeUtc: new Date(Date.now() - 3600000) } },
      );
      const found = await get('/flights/search?origin=CAI&destination=JFK').expect(200);
      expect(found.body.outbound).toHaveLength(0);
    });
  });

  describe('FLT-04, FLT-08, FLT-09, FLT-19: baggage allowance, extra bags and day-based cancellation tiers', () => {
    it('requires a free baggage allowance and max bag weight per cabin when creating a flight', async () => {
      const mod = await moderator();
      await post('/flights', mod.cookies)
        .send({ ...validFlight(), cabins: { economy: { seatCount: 5, price: 100 } } })
        .expect(400);
      await post('/flights', mod.cookies)
        .send({ ...validFlight(), cabins: { economy: { seatCount: 5, price: 100, freeBags: -1, maxBagWeightKg: 23 } } })
        .expect(400);
    });

    it('lets only the airline\'s own moderator set baggage and cancellation policies', async () => {
      const mod = await moderator();
      const other = await moderator();
      const airlineId = mod.user.providerId!.toString();
      const bag = await put(`/airlines/${airlineId}/baggage-policy`, mod.cookies)
        .send({ extraBagPrice: 45, maxExtraBagsPerPassenger: 2 })
        .expect(200);
      expect(bag.body.baggagePolicy).toEqual({ extraBagPrice: 45, maxExtraBagsPerPassenger: 2 });
      await put(`/airlines/${airlineId}/baggage-policy`, other.cookies)
        .send({ extraBagPrice: 1, maxExtraBagsPerPassenger: 1 })
        .expect(403);
      await put(`/airlines/${airlineId}/baggage-policy`, mod.cookies).send({ extraBagPrice: 0 }).expect(400);
      await put(`/airlines/${airlineId}/baggage-policy`).send({ extraBagPrice: 5, maxExtraBagsPerPassenger: 1 }).expect(401);

      await put(`/airlines/${airlineId}/cancellation-policy`, mod.cookies)
        .send({ tiers: [{ daysBefore: 7, refundPercentage: 100 }, { daysBefore: 7, refundPercentage: 50 }] })
        .expect(400);
      await put(`/airlines/${airlineId}/cancellation-policy`, mod.cookies)
        .send({ tiers: [{ daysBefore: 1, refundPercentage: 101 }] })
        .expect(400);
      const tiers = await put(`/airlines/${airlineId}/cancellation-policy`, mod.cookies)
        .send({ tiers: [{ daysBefore: 1, refundPercentage: 25 }, { daysBefore: 7, refundPercentage: 100 }] })
        .expect(200);
      expect(tiers.body.cancellationTiers).toEqual([
        { daysBefore: 7, refundPercentage: 100 },
        { daysBefore: 1, refundPercentage: 25 },
      ]);
      await put(`/airlines/${airlineId}/cancellation-policy`, other.cookies)
        .send({ tiers: [{ daysBefore: 1, refundPercentage: 0 }] })
        .expect(403);
    });

    it('prices extra bags per bag, enforces the per-passenger maximum and snapshots the airline policies', async () => {
      const mod = await moderator();
      const airlineId = mod.user.providerId!.toString();
      const created = await post('/flights', mod.cookies).send(validFlight()).expect(201);
      const service = app.get(FlightBookingsService);
      const traveler = await users.create({
        name: 'Traveler',
        email: `${new Types.ObjectId().toString()}@example.com`,
        passwordHash,
        role: UserRole.USER,
      });
      const draftWith = (extraBags: number) =>
        service.createDraft(traveler.id as string, {
          legs: [{ flightId: created.body._id as string, cabinClass: 'economy' }],
          passengers: [
            { firstName: 'A', lastName: 'B', dateOfBirth: '1990-01-01', passportNumber: 'X1', type: 'adult', extraBags },
          ],
        });

      await expect(draftWith(1)).rejects.toThrow('does not sell extra bags');
      await put(`/airlines/${airlineId}/baggage-policy`, mod.cookies)
        .send({ extraBagPrice: 45, maxExtraBagsPerPassenger: 2 })
        .expect(200);
      await put(`/airlines/${airlineId}/cancellation-policy`, mod.cookies)
        .send({ tiers: [{ daysBefore: 7, refundPercentage: 100 }, { daysBefore: 2, refundPercentage: 50 }] })
        .expect(200);
      await expect(draftWith(3)).rejects.toThrow('At most 2 extra bags');

      const draft = await draftWith(2);
      expect(draft.legs[0].baggageCost).toBe(90);
      expect(draft.totalPrice).toBe(410);
      expect(draft.passengers[0].extraBags).toBe(2);
      expect(draft.cancellationPolicy).toEqual([
        { hoursBeforeDeparture: 168, refundPercentage: 100 },
        { hoursBeforeDeparture: 48, refundPercentage: 50 },
      ]);
      expect(draft.baggagePolicy).toMatchObject({
        extraBagPrice: 45,
        maxExtraBagsPerPassenger: 2,
        legs: [{ cabinClass: 'economy', freeBags: 1, maxBagWeightKg: 23 }],
      });
    });
  });
});
