import 'reflect-metadata';
import { signedEvent, webhookTestSecret } from './stripe-test-signature';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { Connection, Model, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { hash } from 'bcryptjs';
import { CLOCK, UserRole } from '../src/common/domain';
import { User } from '../src/users/user.schema';
import { BOOKING_ACCESS, BOOKING_READER, PROVIDER_MANAGEMENT } from '../src/integrations/contracts';
import { configureApp } from '../src/bootstrap';
import { Payment } from '../src/payments/payments.schema';
import { RefundsService } from '../src/payments/refunds.service';
import { RoomNightLock } from '../src/hotel-bookings/hotel-booking.schema';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Real integration: hotel bookings (Youssef, HTL-16..24) running against the real hotels module
 * (Magdy, HTL-01..15) through HotelInventoryAdapter, with every step done through the public API.
 * Nothing about hotels or rooms is faked here.
 */
describe('Hotel bookings with the real hotels module (HTL-03..22 x HTL-16..21)', () => {
  let mongo: MongoMemoryReplSet;
  let app: INestApplication;
  let users: Model<User>;
  let payments: Model<Payment>;
  let locks: Model<RoomNightLock>;
  let now = new Date();
  let passwordHash: string;
  const password = 'Secure12345';

  const day = (offset: number) => new Date(now.getTime() + offset * DAY).toISOString().slice(0, 10);
  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  const csrf = (t: request.Test) =>
    t.set('Origin', 'http://localhost:5173').set('X-Triplify-CSRF', '1');
  const post = (path: string, cookies: string[] = []) =>
    csrf(request(server()).post(`/api${path}`)).set('Cookie', cookies);
  const patch = (path: string, cookies: string[] = []) =>
    csrf(request(server()).patch(`/api${path}`)).set('Cookie', cookies);
  const put = (path: string, cookies: string[] = []) =>
    csrf(request(server()).put(`/api${path}`)).set('Cookie', cookies);
  const get = (path: string, cookies: string[] = []) =>
    request(server()).get(`/api${path}`).set('Cookie', cookies);

  async function login(email: string) {
    const response = await post('/auth/login').send({ email, password });
    expect(response.status).toBe(200);
    return (response.headers['set-cookie'] as unknown as string[]).map((v) => v.split(';')[0]);
  }
  async function account(role = UserRole.USER, extra: Record<string, unknown> = {}) {
    const user = await users.create({
      name: `Person ${new Types.ObjectId().toString().slice(-4)}`,
      email: `${new Types.ObjectId().toString()}@example.com`,
      passwordHash,
      role,
      ...extra,
    });
    return { user, cookies: await login(user.email) };
  }
  const idOf = (body: { id?: string; _id?: string }) => String(body.id ?? body._id);

  /** Admin creates a hotel; its moderator sets policies, adds rooms and opens availability. */
  async function setUpHotel() {
    const admin = await account(UserRole.ADMIN);
    const created = await post('/hotels', admin.cookies).send({
      name: 'Integration Hotel',
      description: 'A hotel used by the integration test suite.',
      city: 'Cairo',
      country: 'EG',
      address: '1 Nile Corniche, Cairo',
      starClass: 4,
      timeZone: 'UTC',
    });
    expect(created.status).toBe(201);
    const hotelId = idOf(created.body);
    const moderator = await account(UserRole.HOTEL_MODERATOR, {
      providerId: new Types.ObjectId(hotelId),
      providerType: 'HOTEL',
    });
    await patch(`/hotels/${hotelId}/policies`, moderator.cookies)
      .send({
        checkInTime: '15:00',
        checkOutTime: '11:00',
        cancellationTiers: [
          { daysBefore: 7, refundPercentage: 100 },
          { daysBefore: 0, refundPercentage: 0 },
        ],
      })
      .expect(200);
    const roomIds: string[] = [];
    for (const [number, price] of [
      ['101', 100],
      ['102', 150.5],
    ] as const) {
      const room = await post(`/hotels/${hotelId}/rooms`, moderator.cookies).send({
        name: `Room ${number}`,
        number,
        type: 'Double',
        beds: 2,
        maxOccupancy: 3,
        pricePerNight: price,
      });
      expect(room.status).toBe(201);
      roomIds.push(idOf(room.body));
      await put(`/hotels/${hotelId}/rooms/${idOf(room.body)}/availability`, moderator.cookies)
        .send({ ranges: [{ from: day(0), to: day(90) }] })
        .expect(200);
    }
    return { hotelId, roomIds, moderator, admin };
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
    process.env.STRIPE_WEBHOOK_SECRET = webhookTestSecret;
    const { AppModule } = await import('../src/app.module');
    // Only the clock and the unrelated cross-team adapters are replaced; HOTEL_INVENTORY is real.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue({ now: () => new Date(now) })
      .overrideProvider(BOOKING_ACCESS)
      .useValue({ hasUpcomingConfirmedBookings: jest.fn() })
      .overrideProvider(BOOKING_READER)
      .useValue({ findBookings: jest.fn() })
      .overrideProvider(PROVIDER_MANAGEMENT)
      .useValue({ verifyProvider: jest.fn(), setProviderActive: jest.fn() })
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.useLogger(false);
    configureApp(app);
    await app.init();
    users = app.get(getModelToken(User.name));
    payments = app.get(getModelToken(Payment.name));
    locks = app.get(getModelToken(RoomNightLock.name));
    Object.assign(app.get(RefundsService) as unknown as Record<string, unknown>, {
      stripe: { refunds: { create: jest.fn().mockResolvedValue({ id: 're_test_offline', status: 'succeeded' }) } },
    });
    const db = app.get<Connection>(getConnectionToken());
    await Promise.all(Object.values(db.models).map((model) => model.init()));
    passwordHash = await hash(password, 10);
  });

  beforeEach(async () => {
    app.get<ThrottlerStorageService>(ThrottlerStorage).onApplicationShutdown();
    const db = app.get<Connection>(getConnectionToken());
    await Promise.all(Object.values(db.models).map((model) => model.deleteMany({})));
    now = new Date();
  });

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  it('books real rooms end to end and keeps hotel search, room management and reservations consistent', async () => {
    const { hotelId, roomIds, moderator } = await setUpHotel();
    const traveler = await account();
    const stay = `checkInDate=${day(10)}&checkOutDate=${day(12)}`;

    // HTL-15: both rooms are free before booking.
    const before = await get(`/hotels/${hotelId}/available-rooms?${stay}`).expect(200);
    expect(before.body.rooms).toHaveLength(2);

    // HTL-16/18: book both real rooms; price and policy come from the real hotel.
    const held = await post('/hotel-bookings', traveler.cookies)
      .send({
        hotelId,
        checkInDate: day(10),
        checkOutDate: day(12),
        rooms: [
          { roomId: roomIds[0], adults: 2 },
          { roomId: roomIds[1], adults: 1, childrenAges: [6] },
        ],
      })
      .expect(201);
    expect(held.body).toMatchObject({
      status: 'PENDING_PAYMENT',
      hotel: { id: hotelId, name: 'Integration Hotel' },
      total: { amount: '501.00', currency: 'USD' },
      policy: { checkInTime: '15:00', checkOutTime: '11:00' },
    });

    // Magdy's HTL-15 now hides the held rooms.
    const after = await get(`/hotels/${hotelId}/available-rooms?${stay}`).expect(200);
    expect(after.body.rooms).toHaveLength(0);

    // HTL-06: the moderator cannot block or deactivate a reserved room.
    await put(`/hotels/${hotelId}/rooms/${roomIds[0]}/blocked`, moderator.cookies)
      .send({ ranges: [{ from: day(11), to: day(12) }] })
      .expect(409);
    await patch(`/hotels/${hotelId}/rooms/${roomIds[0]}/status`, moderator.cookies)
      .send({ active: false })
      .expect(409);

    // HTL-05: a later price change does not alter the reservation.
    await patch(`/hotels/${hotelId}/rooms/${roomIds[0]}`, moderator.cookies)
      .send({ pricePerNight: 999 })
      .expect(200);

    // HTL-17: pay (verified webhook) and confirm.
    const intentId = `pi_test_${new Types.ObjectId().toString()}`;
    await payments.create({
      bookingId: held.body.id,
      bookingType: 'HOTEL',
      userId: traveler.user._id,
      amount: 501,
      stripePaymentIntentId: intentId,
      stripeClientSecret: `${intentId}_secret`,
      status: 'PENDING',
      policyAccepted: true,
      policyAcceptedAt: now,
    });
    const signed = signedEvent({ type: 'payment_intent.succeeded', data: { object: {
      id: intentId, status: 'succeeded', amount_received: 50100, currency: 'usd',
      metadata: { bookingId: held.body.id, bookingType: 'HOTEL', userId: traveler.user._id.toString() },
    } } });
    await request(server())
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', signed.signature)
      .send(signed.payload)
      .expect(201);
    const confirmed = await post(
      `/hotel-bookings/${held.body.id}/confirm`,
      traveler.cookies,
    ).expect(200);
    expect(confirmed.body.status).toBe('CONFIRMED');
    expect(confirmed.body.total.amount).toBe('501.00');

    // HTL-22 / HTL-08 (Magdy) see the confirmed reservation and its reference.
    const reservations = await get(`/hotels/${hotelId}/reservations`, moderator.cookies).expect(
      200,
    );
    expect(JSON.stringify(reservations.body)).toContain(confirmed.body.reference);
    const status = await get(
      `/hotels/${hotelId}/rooms/${roomIds[0]}/status?from=${day(10)}&to=${day(12)}`,
      moderator.cookies,
    ).expect(200);
    expect(JSON.stringify(status.body)).toContain(confirmed.body.reference);

    // HTL-21: cancelling releases the rooms back to search.
    await post(`/hotel-bookings/${held.body.id}/cancel`, traveler.cookies)
      .send({ confirmation: true })
      .expect(200);
    const released = await get(`/hotels/${hotelId}/available-rooms?${stay}`).expect(200);
    expect(released.body.rooms).toHaveLength(2);
  });

  it('rejects rooms of another hotel, unavailable dates and deactivated rooms from the real inventory', async () => {
    const first = await setUpHotel();
    const second = await setUpHotel();
    const traveler = await account();
    const book = (hotelId: string, roomId: string, from: number, to: number) =>
      post('/hotel-bookings', traveler.cookies).send({
        hotelId,
        checkInDate: day(from),
        checkOutDate: day(to),
        rooms: [{ roomId, adults: 1 }],
      });
    expect((await book(first.hotelId, second.roomIds[0], 5, 6)).body.code).toBe('ROOM_NOT_FOUND');
    expect((await book(first.hotelId, first.roomIds[0], 89, 92)).body.code).toBe(
      'ROOM_NOT_AVAILABLE',
    );
    await put(`/hotels/${first.hotelId}/rooms/${first.roomIds[1]}/blocked`, first.moderator.cookies)
      .send({ ranges: [{ from: day(5), to: day(6) }] })
      .expect(200);
    expect((await book(first.hotelId, first.roomIds[1], 5, 6)).body.code).toBe(
      'ROOM_NOT_AVAILABLE',
    );
    await patch(
      `/hotels/${first.hotelId}/rooms/${first.roomIds[0]}/status`,
      first.moderator.cookies,
    )
      .send({ active: false })
      .expect(200);
    expect((await book(first.hotelId, first.roomIds[0], 20, 21)).body.code).toBe(
      'ROOM_NOT_AVAILABLE',
    );
  });

  it('CRITICAL: concurrent reservations on a real room never overlap', async () => {
    const { hotelId, roomIds } = await setUpHotel();
    const travelers = await Promise.all([account(), account(), account()]);
    const results = await Promise.all(
      Array.from({ length: 9 }, (_, i) =>
        post('/hotel-bookings', travelers[i % 3].cookies).send({
          hotelId,
          checkInDate: day(30),
          checkOutDate: day(33),
          rooms: [{ roomId: roomIds[0], adults: 1 }],
        }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(8);
    expect(await locks.countDocuments({ roomId: new Types.ObjectId(roomIds[0]) })).toBe(3);
  });
});
