import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { Connection, Model, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { hash } from 'bcryptjs';
import { AccountStatus, CLOCK, UserRole } from '../src/common/domain';
import { User } from '../src/users/user.schema';
import { BOOKING_ACCESS, BOOKING_READER, PROVIDER_MANAGEMENT } from '../src/integrations/contracts';
import { configureApp } from '../src/bootstrap';
import { Notification } from '../src/notifications/notifications.schema';
import { Payment, Refund } from '../src/payments/payments.schema';
import { RefundsService } from '../src/payments/refunds.service';
import { HotelBooking, RoomNightLock } from '../src/hotel-bookings/hotel-booking.schema';
import { Review } from '../src/hotel-bookings/review.schema';
import { HotelBookingsService } from '../src/hotel-bookings/hotel-bookings.service';
import { HotelBookingStatus } from '../src/hotel-bookings/hotel-bookings.constants';
import {
  HOTEL_INVENTORY,
  HotelInventoryPort,
  HotelInventorySnapshot,
  RoomInventorySnapshot,
} from '../src/hotel-bookings/hotel-inventory.port';

const DAY = 24 * 60 * 60 * 1000;

describe('Hotel bookings & reviews (HTL-16..24, GEN-11) on a real MongoDB replica set', () => {
  let mongo: MongoMemoryReplSet;
  let app: INestApplication;
  let users: Model<User>;
  let bookings: Model<HotelBooking>;
  let locks: Model<RoomNightLock>;
  let payments: Model<Payment>;
  let refundsModel: Model<Refund>;
  let reviews: Model<Review>;
  let notifications: Model<Notification>;
  let service: HotelBookingsService;
  let now = new Date();
  let passwordHash: string;
  const password = 'Secure12345';
  const stripeRefundCreate = jest.fn();

  // ---- fake hotel inventory (stands in for Magdy's HTL-01..15 adapter)
  const hotelId = new Types.ObjectId().toString();
  const otherHotelId = new Types.ObjectId().toString();
  const roomA = new Types.ObjectId().toString();
  const roomB = new Types.ObjectId().toString();
  const roomC = new Types.ObjectId().toString();
  const otherRoom = new Types.ObjectId().toString();
  let hotels: Record<string, HotelInventorySnapshot>;
  let rooms: RoomInventorySnapshot[];
  const inventory: HotelInventoryPort = {
    getHotel: (id) => Promise.resolve(hotels[id] ?? null),
    getRooms: (hid, ids) =>
      Promise.resolve(rooms.filter((r) => r.hotelId === hid && ids.includes(r.id))),
  };

  /** Hotel-local (UTC) calendar date `offset` days from the injected clock. */
  const day = (offset: number) => new Date(now.getTime() + offset * DAY).toISOString().slice(0, 10);

  const csrf = (t: request.Test) =>
    t.set('Origin', 'http://localhost:5173').set('X-Triplify-CSRF', '1');
  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  const post = (path: string, cookies: string[] = []) =>
    csrf(request(server()).post(`/api${path}`)).set('Cookie', cookies);
  const patch = (path: string, cookies: string[] = []) =>
    csrf(request(server()).patch(`/api${path}`)).set('Cookie', cookies);
  const del = (path: string, cookies: string[] = []) =>
    csrf(request(server()).delete(`/api${path}`)).set('Cookie', cookies);
  const get = (path: string, cookies: string[] = []) =>
    request(server()).get(`/api${path}`).set('Cookie', cookies);

  async function login(email: string) {
    const response = await post('/auth/login').send({ email, password });
    expect(response.status).toBe(200);
    return (response.headers['set-cookie'] as unknown as string[]).map((v) => v.split(';')[0]);
  }
  async function account(role = UserRole.USER, extra: Record<string, unknown> = {}) {
    const user = await users.create({
      name: `Traveler ${new Types.ObjectId().toString().slice(-4)}`,
      email: `${new Types.ObjectId().toString()}@example.com`,
      passwordHash,
      role,
      ...extra,
    });
    return { user, cookies: await login(user.email) };
  }
  type Actor = Awaited<ReturnType<typeof account>>;
  /** Advances the business clock; sessions idle > 30 min require a new login. */
  async function advance(ms: number, ...actors: Actor[]) {
    now = new Date(now.getTime() + ms);
    for (const actor of actors) actor.cookies = await login(actor.user.email);
  }

  const hold = (actor: Actor, body: Record<string, unknown>) =>
    post('/hotel-bookings', actor.cookies).send({ hotelId, ...body });
  const oneRoom = (roomId: string, from: number, to: number, adults = 1) => ({
    checkInDate: day(from),
    checkOutDate: day(to),
    rooms: [{ roomId, adults }],
  });

  /** Simulates Divan's flow: a payment row plus the (unsigned, test-mode) Stripe webhook. */
  async function pay(actor: Actor, bookingId: string, amount: number) {
    const intentId = `pi_test_${new Types.ObjectId().toString()}`;
    await payments.create({
      bookingId,
      bookingType: 'HOTEL',
      userId: actor.user._id,
      amount,
      stripePaymentIntentId: intentId,
      stripeClientSecret: `${intentId}_secret`,
      status: 'PENDING',
      policyAccepted: true,
      policyAcceptedAt: now,
    });
    await request(server())
      .post('/api/payments/webhook')
      .send({ type: 'payment_intent.succeeded', data: { object: { id: intentId } } })
      .expect(201);
  }
  async function confirmedBooking(actor: Actor, roomId: string, from: number, to: number) {
    const created = await hold(actor, oneRoom(roomId, from, to)).expect(201);
    await pay(actor, created.body.id, Number(created.body.total.amount));
    const confirmed = await post(`/hotel-bookings/${created.body.id}/confirm`, actor.cookies);
    expect(confirmed.status).toBe(200);
    return confirmed.body as { id: string; reference: string; status: string };
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
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue({ now: () => new Date(now) })
      .overrideProvider(HOTEL_INVENTORY)
      .useValue(inventory)
      .overrideProvider(BOOKING_ACCESS)
      .useValue({ hasUpcomingConfirmedBookings: jest.fn() })
      .overrideProvider(BOOKING_READER)
      .useValue({ findBookings: jest.fn() })
      .overrideProvider(PROVIDER_MANAGEMENT)
      .useValue({ verifyProvider: jest.fn(), setProviderActive: jest.fn() })
      .compile();
    app = moduleRef.createNestApplication();
    app.useLogger(false);
    configureApp(app);
    await app.init();
    users = app.get(getModelToken(User.name));
    bookings = app.get(getModelToken(HotelBooking.name));
    locks = app.get(getModelToken(RoomNightLock.name));
    payments = app.get(getModelToken(Payment.name));
    refundsModel = app.get(getModelToken(Refund.name));
    reviews = app.get(getModelToken(Review.name));
    notifications = app.get(getModelToken(Notification.name));
    service = app.get(HotelBookingsService);
    // Keep refunds offline: replace only the Stripe client inside Divan's RefundsService.
    Object.assign(app.get(RefundsService) as unknown as Record<string, unknown>, {
      stripe: { refunds: { create: stripeRefundCreate } },
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
    stripeRefundCreate.mockReset().mockResolvedValue({ id: 're_test_offline' });
    const tiers = [
      { daysBefore: 7, refundPercentage: 100 },
      { daysBefore: 2, refundPercentage: 50 },
      { daysBefore: 0, refundPercentage: 0 },
    ];
    hotels = {
      [hotelId]: {
        id: hotelId,
        name: 'Nile View',
        active: true,
        timeZone: 'UTC',
        checkInTime: '15:00',
        checkOutTime: '11:00',
        cancellationTiers: tiers,
      },
      [otherHotelId]: {
        id: otherHotelId,
        name: 'Other',
        active: true,
        timeZone: 'UTC',
        checkInTime: '14:00',
        checkOutTime: '12:00',
        cancellationTiers: tiers,
      },
    };
    const availability = [{ from: day(-5), to: day(400) }];
    const room = (id: string, hid: string, name: string, price: number, max: number) => ({
      id,
      hotelId: hid,
      name,
      type: 'Double',
      beds: 2,
      maxOccupancy: max,
      pricePerNight: price,
      active: true,
      availability,
      blocked: [] as { from: string; to: string }[],
    });
    rooms = [
      room(roomA, hotelId, '101', 100, 2),
      room(roomB, hotelId, '102', 150.5, 4),
      room(roomC, hotelId, '103', 80, 2),
      room(otherRoom, otherHotelId, '201', 90, 2),
    ];
  });

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  // ------------------------------------------------------------------ HTL-16 / HTL-18

  it('holds several rooms with per-room adults/children as one Pending Payment reservation for exactly 10 minutes', async () => {
    const traveler = await account();
    const response = await hold(traveler, {
      checkInDate: day(10),
      checkOutDate: day(13),
      rooms: [
        { roomId: roomA, adults: 2 },
        { roomId: roomB, adults: 2, childrenAges: [0, 17] },
      ],
    }).expect(201);
    expect(response.body).toMatchObject({
      status: 'PENDING_PAYMENT',
      reference: null,
      nights: 3,
      hotel: { id: hotelId, name: 'Nile View' },
      guests: { adults: 4, children: 2 },
      total: { amount: '751.50', currency: 'USD' },
      policy: { checkInTime: '15:00', checkOutTime: '11:00' },
    });
    expect(response.body.rooms[1]).toMatchObject({ childrenAges: [0, 17], subtotal: '451.50' });
    expect(new Date(response.body.holdExpiresAt).getTime()).toBe(now.getTime() + 10 * 60 * 1000);
    expect(response.body.checkInAt).toBe(`${day(10)}T15:00:00.000Z`);
    expect(await locks.countDocuments({ bookingId: response.body.id })).toBe(6);
  });

  it('validates guests, dates, rooms and authentication server-side', async () => {
    const traveler = await account();
    await hold(traveler, {
      ...oneRoom(roomA, 5, 6),
      rooms: [{ roomId: roomA, adults: 1, childrenAges: [18] }],
    }).expect(400);
    await hold(traveler, { ...oneRoom(roomA, 5, 6), rooms: [{ roomId: roomA, adults: 0 }] }).expect(
      400,
    );
    const occupancy = await hold(traveler, {
      ...oneRoom(roomA, 5, 6),
      rooms: [{ roomId: roomA, adults: 2, childrenAges: [3] }],
    }).expect(400);
    expect(occupancy.body.code).toBe('OCCUPANCY_EXCEEDED');
    const duplicate = await hold(traveler, {
      ...oneRoom(roomA, 5, 6),
      rooms: [
        { roomId: roomA, adults: 1 },
        { roomId: roomA, adults: 1 },
      ],
    }).expect(400);
    expect(duplicate.body.code).toBe('DUPLICATE_ROOM');
    expect((await hold(traveler, oneRoom(roomA, 6, 6)).expect(400)).body.code).toBe(
      'INVALID_STAY_DATES',
    );
    expect((await hold(traveler, oneRoom(roomA, -1, 2)).expect(400)).body.code).toBe(
      'CHECK_IN_IN_PAST',
    );
    expect((await hold(traveler, oneRoom(roomA, 1, 40)).expect(400)).body.code).toBe(
      'STAY_TOO_LONG',
    );
    await hold(traveler, { ...oneRoom(roomA, 5, 6), checkInDate: '2026-02-30' }).expect(400);
    await hold(traveler, { ...oneRoom(roomA, 5, 6), price: 1 }).expect(400);
    expect((await hold(traveler, oneRoom(otherRoom, 5, 6)).expect(404)).body.code).toBe(
      'ROOM_NOT_FOUND',
    );
    rooms[0].blocked = [{ from: day(5), to: day(6) }];
    expect((await hold(traveler, oneRoom(roomA, 4, 7)).expect(409)).body.code).toBe(
      'ROOM_NOT_AVAILABLE',
    );
    expect((await hold(traveler, oneRoom(roomB, 398, 402)).expect(409)).body.code).toBe(
      'ROOM_NOT_AVAILABLE',
    );
    hotels[hotelId].active = false;
    expect((await hold(traveler, oneRoom(roomB, 5, 6)).expect(409)).body.code).toBe(
      'HOTEL_NOT_BOOKABLE',
    );
    await request(server())
      .post('/api/hotel-bookings')
      .set('Origin', 'http://localhost:5173')
      .set('X-Triplify-CSRF', '1')
      .send({ hotelId, ...oneRoom(roomB, 5, 6) })
      .expect(401);
    expect(await bookings.countDocuments()).toBe(0);
    expect(await locks.countDocuments()).toBe(0);
  });

  it('CRITICAL: concurrent reservations never claim the same room for overlapping dates', async () => {
    const travelers = await Promise.all([account(), account(), account(), account()]);
    const ranges: [number, number][] = [
      [20, 23],
      [21, 22],
      [22, 25],
      [19, 21],
      [20, 23],
      [21, 24],
      [22, 23],
      [20, 21],
    ];
    const results = await Promise.all(
      ranges.map(([from, to], i) => hold(travelers[i % 4], oneRoom(roomA, from, to))),
    );
    const statuses = results.map((r) => r.status).sort();
    const created = results.filter((r) => r.status === 201);
    // Several winners are possible only if their nights are disjoint; no night may be claimed twice.
    expect(statuses.every((s) => s === 201 || s === 409)).toBe(true);
    expect(created.length).toBeGreaterThanOrEqual(1);
    const claimedNights = await locks.find({ roomId: roomA }).lean();
    const nights = claimedNights.map((c) => c.night);
    expect(new Set(nights).size).toBe(nights.length);
    for (const r of results.filter((x) => x.status === 409))
      expect(['ROOM_ALREADY_RESERVED']).toContain(r.body.code);
    // Each winning reservation owns all of its nights; losers own none.
    for (const r of created)
      expect(await locks.countDocuments({ bookingId: r.body.id })).toBe(r.body.nights);
    expect(await bookings.countDocuments()).toBe(created.length);

    // Identical requests: exactly one winner.
    const same = await Promise.all(
      Array.from({ length: 8 }, (_, i) => hold(travelers[i % 4], oneRoom(roomC, 30, 33))),
    );
    expect(same.filter((r) => r.status === 201)).toHaveLength(1);
    expect(same.filter((r) => r.status === 409)).toHaveLength(7);
    expect(await locks.countDocuments({ roomId: roomC })).toBe(3);
  });

  it('is all-or-nothing for multi-room requests and allows back-to-back stays', async () => {
    const first = await account();
    const second = await account();
    await hold(first, oneRoom(roomB, 20, 22)).expect(201);
    const conflict = await hold(second, {
      checkInDate: day(21),
      checkOutDate: day(23),
      rooms: [
        { roomId: roomA, adults: 1 },
        { roomId: roomB, adults: 1 },
      ],
    }).expect(409);
    expect(conflict.body.code).toBe('ROOM_ALREADY_RESERVED');
    expect(await locks.countDocuments({ roomId: roomA })).toBe(0);
    expect(await bookings.countDocuments({ userId: second.user._id })).toBe(0);
    await hold(second, oneRoom(roomA, 21, 23)).expect(201);
    // Check-out day of one stay can be the check-in day of the next.
    await hold(second, oneRoom(roomB, 22, 24)).expect(201);
  });

  it('expires an unpaid hold after 10 minutes and releases its rooms (GEN-11)', async () => {
    const first = await account();
    const second = await account();
    const held = await hold(first, oneRoom(roomA, 10, 12)).expect(201);
    const overlapping = oneRoom(roomA, 11, 12); // fixed before the clock moves
    await advance(9 * 60 * 1000, first, second);
    await hold(second, overlapping).expect(409);
    await advance(60 * 1000 + 1, first, second);
    await hold(second, overlapping).expect(201);
    const expired = await get(`/hotel-bookings/${held.body.id}`, first.cookies).expect(200);
    expect(expired.body.status).toBe('EXPIRED');
    expect(await locks.countDocuments({ bookingId: held.body.id })).toBe(0);
    const late = await post(`/hotel-bookings/${held.body.id}/confirm`, first.cookies).expect(409);
    expect(late.body.code).toBe('BOOKING_NOT_PENDING');
  });

  // ------------------------------------------------------------------ HTL-17

  it('confirms only after a verified successful payment, with a unique reference and notification', async () => {
    const traveler = await account();
    const other = await account();
    const held = await hold(traveler, oneRoom(roomA, 10, 12)).expect(201);
    const unpaid = await post(`/hotel-bookings/${held.body.id}/confirm`, traveler.cookies).expect(
      409,
    );
    expect(unpaid.body.code).toBe('PAYMENT_NOT_VERIFIED');
    await pay(traveler, held.body.id, 200);
    await post(`/hotel-bookings/${held.body.id}/confirm`, other.cookies).expect(404);
    const confirmed = await post(
      `/hotel-bookings/${held.body.id}/confirm`,
      traveler.cookies,
    ).expect(200);
    expect(confirmed.body).toMatchObject({ status: 'CONFIRMED', canCancel: true });
    expect(confirmed.body.reference).toMatch(/^HTL-[A-Z2-9]{8}$/);
    expect(confirmed.body.holdExpiresAt).toBeUndefined();
    const again = await post(`/hotel-bookings/${held.body.id}/confirm`, traveler.cookies).expect(
      200,
    );
    expect(again.body.reference).toBe(confirmed.body.reference);
    expect(
      await notifications.countDocuments({
        userId: traveler.user._id,
        type: 'BOOKING_CONFIRMED',
        'metadata.reference': confirmed.body.reference,
      }),
    ).toBe(1);
    const claims = await locks.find({ bookingId: held.body.id }).lean();
    expect(claims).toHaveLength(2);
    expect(claims.filter((c) => c.expiresAt !== undefined && c.expiresAt !== null)).toEqual([]);
    // A confirmed reservation is never expired by the hold timer.
    // Dates are fixed before moving the clock so the test is stable around UTC midnight.
    const sameNight = oneRoom(roomA, 11, 12);
    await advance(60 * 60 * 1000, traveler, other);
    await hold(other, sameNight).expect(409);
    expect((await get(`/hotel-bookings/${held.body.id}`, traveler.cookies)).body.status).toBe(
      'CONFIRMED',
    );
    expect(
      await locks.countDocuments({ bookingId: held.body.id, expiresAt: { $exists: true } }),
    ).toBe(0);
  });

  it('rejects a payment whose amount does not match the reservation total', async () => {
    const traveler = await account();
    const held = await hold(traveler, oneRoom(roomA, 10, 12)).expect(201);
    await pay(traveler, held.body.id, 1);
    const response = await post(`/hotel-bookings/${held.body.id}/confirm`, traveler.cookies).expect(
      409,
    );
    expect(response.body.code).toBe('PAYMENT_AMOUNT_MISMATCH');
  });

  it('confirms paid holds automatically in the system sweep and refunds paid holds that lost their rooms', async () => {
    const traveler = await account();
    const held = await hold(traveler, oneRoom(roomA, 10, 12)).expect(201);
    await pay(traveler, held.body.id, 200);
    expect(await service.sweep()).toMatchObject({ confirmed: 1 });
    expect((await bookings.findById(held.body.id))!.status).toBe(HotelBookingStatus.CONFIRMED);

    // Paid after its hold was taken over by someone else: expired and refunded 100%.
    const late = await hold(traveler, oneRoom(roomB, 10, 12)).expect(201);
    const rival = await account();
    await advance(11 * 60 * 1000, traveler, rival);
    await hold(rival, oneRoom(roomB, 10, 12)).expect(201);
    await pay(traveler, late.body.id, 301);
    const response = await post(`/hotel-bookings/${late.body.id}/confirm`, traveler.cookies);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('HOLD_EXPIRED');
    expect(
      await refundsModel.countDocuments({ bookingId: late.body.id, refundPercentage: 100 }),
    ).toBe(1);
  });

  // ------------------------------------------------------------------ HTL-20 / ACC-11

  it('lists reservations grouped as Upcoming, Past and Cancelled with pagination', async () => {
    const traveler = await account();
    await confirmedBooking(traveler, roomA, 2, 3);
    const toCancel = await confirmedBooking(traveler, roomB, 20, 21);
    await post(`/hotel-bookings/${toCancel.id}/cancel`, traveler.cookies)
      .send({ confirmation: true })
      .expect(200);
    await hold(traveler, oneRoom(roomC, 5, 6)).expect(201);
    const upcoming = await get('/hotel-bookings', traveler.cookies).expect(200);
    expect(upcoming.body).toMatchObject({
      group: 'UPCOMING',
      total: 2,
      counts: { UPCOMING: 2, PAST: 0, CANCELLED: 1 },
    });
    expect(upcoming.body.items.map((b: { checkInDate: string }) => b.checkInDate)).toEqual([
      day(2),
      day(5),
    ]);
    await advance(4 * DAY, traveler);
    const past = await get('/hotel-bookings?group=PAST', traveler.cookies).expect(200);
    expect(past.body.items).toHaveLength(1);
    expect(past.body.items[0].status).toBe('COMPLETED');
    const cancelled = await get('/hotel-bookings?group=CANCELLED', traveler.cookies).expect(200);
    expect(cancelled.body.items.map((b: { status: string }) => b.status).sort()).toEqual([
      'CANCELLED',
      'EXPIRED',
    ]);
    await get('/hotel-bookings?group=ALL', traveler.cookies).expect(400);

    // GEN-05: page size 10.
    const docs = Array.from({ length: 11 }, (_, i) => ({
      userId: traveler.user._id,
      providerId: new Types.ObjectId(hotelId),
      hotelName: 'Nile View',
      timeZone: 'UTC',
      checkInDate: day(100 + i),
      checkOutDate: day(101 + i),
      checkInAt: new Date(now.getTime() + (100 + i) * DAY),
      checkOutAt: new Date(now.getTime() + (101 + i) * DAY),
      nights: 1,
      rooms: [
        {
          roomId: new Types.ObjectId(roomC),
          roomName: '103',
          roomType: 'Double',
          beds: 2,
          maxOccupancy: 2,
          pricePerNightCents: 1000,
          subtotalCents: 1000,
          adults: 1,
          childrenAges: [],
        },
      ],
      totalAmountCents: 1000,
      status: HotelBookingStatus.CONFIRMED,
      policy: { checkInTime: '15:00', checkOutTime: '11:00', cancellationTiers: [] },
    }));
    await bookings.insertMany(docs);
    const page1 = await get('/hotel-bookings?group=UPCOMING', traveler.cookies).expect(200);
    const page2 = await get('/hotel-bookings?group=UPCOMING&page=2', traveler.cookies).expect(200);
    expect(page1.body).toMatchObject({ total: 11, pageCount: 2 });
    expect(page1.body.items).toHaveLength(10);
    expect(page2.body.items).toHaveLength(1);
  });

  it('restricts reservation details to the owner and the moderator of that hotel', async () => {
    const owner = await account();
    const stranger = await account();
    const moderator = await account(UserRole.HOTEL_MODERATOR, {
      providerId: new Types.ObjectId(hotelId),
      providerType: 'HOTEL',
    });
    const otherModerator = await account(UserRole.HOTEL_MODERATOR, {
      providerId: new Types.ObjectId(otherHotelId),
      providerType: 'HOTEL',
    });
    const admin = await account(UserRole.ADMIN);
    const held = await hold(owner, oneRoom(roomA, 10, 11)).expect(201);
    await get(`/hotel-bookings/${held.body.id}`, owner.cookies).expect(200);
    await get(`/hotel-bookings/${held.body.id}`, moderator.cookies).expect(200);
    await get(`/hotel-bookings/${held.body.id}`, stranger.cookies).expect(404);
    await get(`/hotel-bookings/${held.body.id}`, otherModerator.cookies).expect(404);
    await get(`/hotel-bookings/${held.body.id}`, admin.cookies).expect(403);
    await get('/hotel-bookings/not-an-id', owner.cookies).expect(400);
    await hold(moderator, oneRoom(roomB, 10, 11)).expect(403);
    const listed = await service.findHotelReservations(
      {
        id: moderator.user.id as string,
        name: 'Mod',
        role: UserRole.HOTEL_MODERATOR,
        status: AccountStatus.ACTIVE,
        providerId: hotelId,
        providerType: 'HOTEL',
        mustChangePassword: false,
        authVersion: 0,
        sessionId: 's',
      },
      hotelId,
    );
    expect(listed.items[0].guest.id).toBe(owner.user.id);
  });

  // ------------------------------------------------------------------ HTL-21

  it('cancels a whole confirmed reservation before check-in and refunds per the hotel tiers', async () => {
    const traveler = await account();
    const rival = await account();
    const booking = await confirmedBooking(traveler, roomA, 10, 12);
    const quote = await get(
      `/hotel-bookings/${booking.id}/cancellation-quote`,
      traveler.cookies,
    ).expect(200);
    expect(quote.body).toMatchObject({
      eligible: true,
      daysBefore: 10,
      refundPercentage: 100,
      refundAmount: '200.00',
    });
    await post(`/hotel-bookings/${booking.id}/cancel`, traveler.cookies).send({}).expect(400);
    await post(`/hotel-bookings/${booking.id}/cancel`, rival.cookies)
      .send({ confirmation: true })
      .expect(404);
    const cancelled = await post(`/hotel-bookings/${booking.id}/cancel`, traveler.cookies)
      .send({ confirmation: true })
      .expect(200);
    expect(cancelled.body).toMatchObject({
      status: 'CANCELLED',
      cancellation: { refundPercentage: 100, refundAmount: '200.00', refundStatus: 'SUCCEEDED' },
    });
    expect(stripeRefundCreate).toHaveBeenCalledWith(expect.objectContaining({ amount: 20000 }));
    expect((await payments.findOne({ bookingId: booking.id }))!.status).toBe('REFUNDED');
    expect(
      await notifications.countDocuments({ userId: traveler.user._id, type: 'BOOKING_CANCELLED' }),
    ).toBe(1);
    // Rooms are released for others; second cancel is rejected.
    await hold(rival, oneRoom(roomA, 10, 12)).expect(201);
    expect(
      (
        await post(`/hotel-bookings/${booking.id}/cancel`, traveler.cookies)
          .send({ confirmation: true })
          .expect(409)
      ).body.code,
    ).toBe('BOOKING_NOT_CONFIRMED');
  });

  it('applies partial and zero refund tiers and blocks cancellation from the check-in date', async () => {
    const traveler = await account();
    const partial = await confirmedBooking(traveler, roomA, 3, 4);
    const partialQuote = await get(
      `/hotel-bookings/${partial.id}/cancellation-quote`,
      traveler.cookies,
    );
    expect(partialQuote.body).toMatchObject({ refundPercentage: 50, refundAmount: '50.00' });
    const none = await confirmedBooking(traveler, roomB, 1, 2);
    const cancelled = await post(`/hotel-bookings/${none.id}/cancel`, traveler.cookies)
      .send({ confirmation: true })
      .expect(200);
    expect(cancelled.body.cancellation).toMatchObject({
      refundPercentage: 0,
      refundStatus: 'NOT_APPLICABLE',
    });
    expect(stripeRefundCreate).not.toHaveBeenCalled();
    await advance(3 * DAY, traveler);
    const blocked = await post(`/hotel-bookings/${partial.id}/cancel`, traveler.cookies)
      .send({ confirmation: true })
      .expect(409);
    expect(blocked.body.code).toBe('CHECK_IN_DATE_REACHED');
    const pending = await hold(traveler, oneRoom(roomC, 10, 11)).expect(201);
    await post(`/hotel-bookings/${pending.body.id}/cancel`, traveler.cookies)
      .send({ confirmation: true })
      .expect(409);
  });

  it('keeps the booking cancelled and records FAILED when the refund provider errors', async () => {
    const traveler = await account();
    const booking = await confirmedBooking(traveler, roomA, 10, 11);
    stripeRefundCreate.mockRejectedValue(new Error('offline'));
    // Divan's RefundsService falls back to a simulated refund id when Stripe is unreachable.
    const cancelled = await post(`/hotel-bookings/${booking.id}/cancel`, traveler.cookies)
      .send({ confirmation: true })
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect(['SUCCEEDED', 'FAILED']).toContain(cancelled.body.cancellation.refundStatus);
  });

  // ------------------------------------------------------------------ HTL-23 / HTL-24

  it('completes stays after check-out and allows exactly one valid review per completed reservation', async () => {
    const traveler = await account();
    const stranger = await account();
    const stay = await confirmedBooking(traveler, roomA, 1, 2);
    const upcoming = await confirmedBooking(traveler, roomB, 10, 11);
    expect(
      (
        await post(`/hotel-bookings/${stay.id}/review`, traveler.cookies)
          .send({ rating: 5 })
          .expect(409)
      ).body.code,
    ).toBe('REVIEW_NOT_ELIGIBLE');
    await advance(2 * DAY + 12 * 60 * 60 * 1000, traveler, stranger);
    for (const bad of [
      { rating: 0 },
      { rating: 6 },
      { rating: 4.5 },
      { rating: 3, text: 'x'.repeat(1001) },
      {},
    ])
      await post(`/hotel-bookings/${stay.id}/review`, traveler.cookies).send(bad).expect(400);
    await post(`/hotel-bookings/${stay.id}/review`, stranger.cookies)
      .send({ rating: 1 })
      .expect(404);
    const created = await post(`/hotel-bookings/${stay.id}/review`, traveler.cookies)
      .send({ rating: 4, text: ` ${'Great stay. '.repeat(83)}`.slice(0, 1000) })
      .expect(201);
    expect(created.body).toMatchObject({ rating: 4, hotelId, bookingId: stay.id });
    expect((await get(`/hotel-bookings/${stay.id}`, traveler.cookies)).body.status).toBe(
      'COMPLETED',
    );
    expect(
      (
        await post(`/hotel-bookings/${stay.id}/review`, traveler.cookies)
          .send({ rating: 5 })
          .expect(409)
      ).body.code,
    ).toBe('REVIEW_ALREADY_EXISTS');
    await post(`/hotel-bookings/${upcoming.id}/review`, traveler.cookies)
      .send({ rating: 5 })
      .expect(409);

    await patch(`/reviews/${created.body.id}`, stranger.cookies).send({ rating: 1 }).expect(404);
    await patch(`/reviews/${created.body.id}`, traveler.cookies).send({}).expect(400);
    const edited = await patch(`/reviews/${created.body.id}`, traveler.cookies)
      .send({ rating: 5, text: 'Updated' })
      .expect(200);
    expect(edited.body).toMatchObject({ rating: 5, text: 'Updated' });
    await del(`/reviews/${created.body.id}`, stranger.cookies).expect(404);
    await del(`/reviews/${created.body.id}`, traveler.cookies).expect(200);
    expect(await reviews.countDocuments()).toBe(0);
  });

  it('returns public average rating, rating count and newest-first paginated reviews', async () => {
    const author = await users.create({
      name: 'Alice',
      email: 'alice@example.com',
      passwordHash,
    });
    const gone = await users.create({
      name: 'Bob',
      email: 'bob@example.com',
      passwordHash,
      status: AccountStatus.DEACTIVATED,
    });
    const base = Date.now();
    await reviews.insertMany(
      Array.from({ length: 12 }, (_, i) => ({
        bookingId: new Types.ObjectId(),
        hotelId: new Types.ObjectId(hotelId),
        userId: i === 0 ? gone._id : author._id,
        rating: i === 11 ? 1 : (i % 5) + 1,
        text: `Review ${i}`,
        hidden: i === 11,
        createdAt: new Date(base - (11 - i) * 1000),
      })),
    );
    const page1 = await get(`/hotels/${hotelId}/reviews`).expect(200);
    const visibleRatings = Array.from({ length: 11 }, (_, i) => (i % 5) + 1);
    const average =
      Math.round((visibleRatings.reduce((a, b) => a + b, 0) / visibleRatings.length) * 10) / 10;
    expect(page1.body).toMatchObject({
      hotelId,
      averageRating: average,
      ratingCount: 11,
      total: 11,
      page: 1,
      pageCount: 2,
    });
    expect(page1.body.items).toHaveLength(10);
    expect(page1.body.items[0].text).toBe('Review 10');
    const page2 = await get(`/hotels/${hotelId}/reviews?page=2`).expect(200);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.items[0].author.name).toBe('Deleted user');
    const empty = await get(`/hotels/${otherHotelId}/reviews`).expect(200);
    expect(empty.body).toMatchObject({ averageRating: null, ratingCount: 0, items: [] });
  });

  // ------------------------------------------------------------------ teammate integration

  it('exposes hotel-side integration queries for accounts, admin and hotel management', async () => {
    const traveler = await account();
    const booking = await confirmedBooking(traveler, roomA, 10, 12);
    await hold(traveler, oneRoom(roomB, 10, 11)).expect(201);
    const db = app.get<Connection>(getConnectionToken());
    const session = await db.startSession();
    try {
      expect(
        await service.hasUpcomingConfirmedBookings(traveler.user.id as string, now, session),
      ).toBe(true);
      expect(
        await service.hasUpcomingConfirmedBookings(
          traveler.user.id as string,
          new Date(now.getTime() + 13 * DAY),
          session,
        ),
      ).toBe(false);
    } finally {
      await session.endSession();
    }
    const summaries = await service.findBookingSummaries({ page: 1, status: 'CONFIRMED' }, 10);
    expect(summaries.total).toBe(1);
    expect(summaries.items[0]).toMatchObject({
      reference: booking.reference,
      type: 'HOTEL',
      provider: { id: hotelId, name: 'Nile View' },
      amount: { value: '200.00', currency: 'USD' },
      status: 'CONFIRMED',
    });
    expect(await service.hasActiveReservationsForRoom(roomA, day(11), day(12))).toBe(true);
    expect(await service.hasActiveReservationsForRoom(roomA, day(12), day(20))).toBe(false);
    const claims = await service.getRoomNightClaims([roomA, roomB], day(10), day(11));
    expect(claims.map((c) => c.reference).sort()).toEqual([booking.reference, null].sort());
  });
});
