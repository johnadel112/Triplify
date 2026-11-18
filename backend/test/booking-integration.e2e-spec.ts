import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { Connection, Model, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { hash } from 'bcryptjs';
import { AccountStatus, UserRole } from '../src/common/domain';
import { User } from '../src/users/user.schema';
import { PROVIDER_MANAGEMENT } from '../src/integrations/contracts';
import { configureApp } from '../src/bootstrap';
import { FlightBooking } from '../src/flight-bookings/flight-booking.schema';
import { AirlineProfile, Flight } from '../src/flights/flights.schema';
import { HotelBooking } from '../src/hotel-bookings/hotel-booking.schema';
import { HotelBookingStatus } from '../src/hotel-bookings/hotel-bookings.constants';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Real BOOKING_ACCESS / BOOKING_READER (hotel + flight halves through BookingsCompositeAdapter),
 * exercised through John's account deactivation (ACC-12) and admin booking overview (ACC-17).
 */
describe('Booking integration: account deactivation and admin bookings (ACC-12, ACC-17)', () => {
  let mongo: MongoMemoryReplSet;
  let app: INestApplication;
  let users: Model<User>;
  let hotelBookings: Model<HotelBooking>;
  let flightBookings: Model<FlightBooking>;
  let flights: Model<Flight>;
  let airlines: Model<AirlineProfile>;
  let passwordHash: string;
  const password = 'Secure12345';
  const now = () => Date.now();

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  const post = (path: string, cookies: string[]) =>
    request(server())
      .post(`/api${path}`)
      .set('Origin', 'http://localhost:5173')
      .set('X-Triplify-CSRF', '1')
      .set('Cookie', cookies);
  const get = (path: string, cookies: string[]) =>
    request(server()).get(`/api${path}`).set('Cookie', cookies);

  async function account(role = UserRole.USER) {
    const user = await users.create({
      name: `Person ${new Types.ObjectId().toString().slice(-4)}`,
      email: `${new Types.ObjectId().toString()}@example.com`,
      passwordHash,
      role,
    });
    const response = await request(server())
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('X-Triplify-CSRF', '1')
      .send({ email: user.email, password });
    expect(response.status).toBe(200);
    const cookies = (response.headers['set-cookie'] as unknown as string[]).map(
      (v) => v.split(';')[0],
    );
    return { user, cookies };
  }

  async function hotelBooking(userId: Types.ObjectId, status: HotelBookingStatus, inDays: number) {
    const checkIn = new Date(now() + inDays * DAY);
    const checkOut = new Date(checkIn.getTime() + 2 * DAY);
    return hotelBookings.create({
      reference:
        status === HotelBookingStatus.PENDING_PAYMENT ? undefined : `HTL-${inDays}${status[0]}`,
      userId,
      providerId: new Types.ObjectId(),
      hotelName: 'Nile View',
      timeZone: 'UTC',
      checkInDate: checkIn.toISOString().slice(0, 10),
      checkOutDate: checkOut.toISOString().slice(0, 10),
      checkInAt: checkIn,
      checkOutAt: checkOut,
      nights: 2,
      rooms: [
        {
          roomId: new Types.ObjectId(),
          roomName: '101',
          roomType: 'Double',
          beds: 1,
          maxOccupancy: 2,
          pricePerNightCents: 10000,
          subtotalCents: 20000,
          adults: 1,
          childrenAges: [],
        },
      ],
      totalAmountCents: 20000,
      status,
      policy: { checkInTime: '15:00', checkOutTime: '11:00', cancellationTiers: [] },
    });
  }

  async function flightBooking(
    userId: Types.ObjectId,
    status: string,
    inDays: number,
    flightId: Types.ObjectId,
  ) {
    const departure = new Date(now() + inDays * DAY);
    return flightBookings.create({
      userId,
      reference: `FLT${Math.abs(inDays)}${status.slice(0, 2)}${new Types.ObjectId().toString().slice(-4)}`,
      status,
      legs: [
        {
          flightId,
          flightNumber: 'MS777',
          cabinClass: 'economy',
          departureAirport: 'CAI',
          arrivalAirport: 'JFK',
          departureTime: departure,
          arrivalTime: new Date(departure.getTime() + 10 * 3600 * 1000),
          farePerSeat: 300,
          baggageCost: 0,
          legTotal: 300,
        },
      ],
      passengers: [
        {
          firstName: 'A',
          lastName: 'B',
          dateOfBirth: new Date('1990-01-01'),
          passportNumber: 'X1',
          type: 'adult',
        },
      ],
      seatCount: 1,
      currency: 'USD',
      totalPrice: 300,
      firstDeparture: departure,
      lastDeparture: departure,
    });
  }

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
    const { AppModule } = await import('../src/app.module');
    // BOOKING_ACCESS and BOOKING_READER are the real adapters here; only provider management is mocked.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PROVIDER_MANAGEMENT)
      .useValue({ verifyProvider: jest.fn(), setProviderActive: jest.fn() })
      .compile();
    app = moduleRef.createNestApplication();
    app.useLogger(false);
    configureApp(app);
    await app.init();
    users = app.get(getModelToken(User.name));
    hotelBookings = app.get(getModelToken(HotelBooking.name));
    flightBookings = app.get(getModelToken(FlightBooking.name));
    flights = app.get(getModelToken(Flight.name));
    airlines = app.get(getModelToken(AirlineProfile.name));
    const db = app.get<Connection>(getConnectionToken());
    await Promise.all(Object.values(db.models).map((model) => model.init()));
    passwordHash = await hash(password, 10);
  });

  beforeEach(async () => {
    app.get<ThrottlerStorageService>(ThrottlerStorage).onApplicationShutdown();
    const db = app.get<Connection>(getConnectionToken());
    await Promise.all(Object.values(db.models).map((model) => model.deleteMany({})));
  });

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  async function airlineFlight() {
    const moderatorId = new Types.ObjectId();
    const airline = await airlines.create({ moderatorId, name: 'Nile Air' });
    const flight = await flights.create({
      flightNumber: 'MS777',
      airlineId: moderatorId,
      departureAirport: 'CAI',
      arrivalAirport: 'JFK',
      departureTimeUtc: new Date(now() + 30 * DAY),
      arrivalTimeUtc: new Date(now() + 30 * DAY + 3600 * 1000),
      departureDate: '2030-01-01',
      cabins: { economy: { seatCount: 10, price: 300 } },
    });
    return { airline, flight };
  }

  it('ACC-12: blocks deactivation while an upcoming confirmed flight exists', async () => {
    const traveler = await account();
    const { flight } = await airlineFlight();
    await flightBooking(traveler.user._id, 'CONFIRMED', 5, flight._id);
    const blocked = await post('/users/me/deactivate', traveler.cookies)
      .send({ confirmation: true })
      .expect(409);
    expect(JSON.stringify(blocked.body)).toContain('Upcoming Confirmed bookings');
    expect((await users.findById(traveler.user._id))!.status).toBe(AccountStatus.ACTIVE);
  });

  it('ACC-12: blocks deactivation while an upcoming confirmed hotel stay exists', async () => {
    const traveler = await account();
    await hotelBooking(traveler.user._id, HotelBookingStatus.CONFIRMED, 5);
    await post('/users/me/deactivate', traveler.cookies).send({ confirmation: true }).expect(409);
  });

  it('ACC-12: allows deactivation when only past, cancelled or pending bookings exist', async () => {
    const traveler = await account();
    const { flight } = await airlineFlight();
    await flightBooking(traveler.user._id, 'CONFIRMED', -3, flight._id);
    await flightBooking(traveler.user._id, 'CANCELLED', 5, flight._id);
    await flightBooking(traveler.user._id, 'PENDING', 5, flight._id);
    await hotelBooking(traveler.user._id, HotelBookingStatus.CANCELLED, 5);
    await hotelBooking(traveler.user._id, HotelBookingStatus.COMPLETED, -10);
    await post('/users/me/deactivate', traveler.cookies).send({ confirmation: true }).expect(200);
    expect((await users.findById(traveler.user._id))!.status).toBe(AccountStatus.DEACTIVATED);
  });

  it('ACC-17: lists flight and hotel bookings together for admins, newest first, 10 per page', async () => {
    const admin = await account(UserRole.ADMIN);
    const traveler = await account();
    const { airline, flight } = await airlineFlight();
    for (let i = 0; i < 6; i += 1)
      await flightBooking(traveler.user._id, 'CONFIRMED', 10 + 2 * i, flight._id);
    for (let i = 0; i < 6; i += 1)
      await hotelBooking(traveler.user._id, HotelBookingStatus.CONFIRMED, 11 + 2 * i);
    await flightBooking(traveler.user._id, 'DRAFT', 40, flight._id);

    const page1 = await get('/admin/bookings', admin.cookies).expect(200);
    const page2 = await get('/admin/bookings?page=2', admin.cookies).expect(200);
    expect(page1.body).toMatchObject({ total: 12, page: 1, pageCount: 2 });
    expect(page1.body.items).toHaveLength(10);
    expect(page2.body.items).toHaveLength(2);
    const starts = [...page1.body.items, ...page2.body.items].map(
      (r: { startDate: string }) => r.startDate,
    );
    expect(starts).toEqual([...starts].sort().reverse());
    expect(new Set([...page1.body.items].map((r: { type: string }) => r.type))).toEqual(
      new Set(['FLIGHT', 'HOTEL']),
    );
    const flightRow = page1.body.items.find((r: { type: string }) => r.type === 'FLIGHT');
    expect(flightRow).toMatchObject({
      user: { id: traveler.user.id as string, name: traveler.user.name },
      provider: { id: airline.id as string, name: 'Nile Air' },
      amount: { value: '300.00', currency: 'USD' },
      status: 'CONFIRMED',
    });
  });

  it('ACC-17: filters by type and normalized status, and stays admin-only', async () => {
    const admin = await account(UserRole.ADMIN);
    const traveler = await account();
    const { flight } = await airlineFlight();
    await flightBooking(traveler.user._id, 'CONFIRMED', -5, flight._id);
    await flightBooking(traveler.user._id, 'EXPIRED', 5, flight._id);
    await hotelBooking(traveler.user._id, HotelBookingStatus.EXPIRED, 5);
    await hotelBooking(traveler.user._id, HotelBookingStatus.CONFIRMED, 5);

    const completedFlights = await get(
      '/admin/bookings?type=FLIGHT&status=COMPLETED',
      admin.cookies,
    ).expect(200);
    expect(completedFlights.body).toMatchObject({
      total: 1,
      items: [{ type: 'FLIGHT', status: 'COMPLETED' }],
    });
    const cancelled = await get('/admin/bookings?status=CANCELLED', admin.cookies).expect(200);
    expect(cancelled.body.total).toBe(2);
    const hotels = await get('/admin/bookings?type=HOTEL', admin.cookies).expect(200);
    expect(hotels.body.items.every((r: { type: string }) => r.type === 'HOTEL')).toBe(true);
    await get('/admin/bookings', traveler.cookies).expect(403);
  });
});
