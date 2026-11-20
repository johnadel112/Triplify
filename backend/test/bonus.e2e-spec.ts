import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Connection, Model, Types } from 'mongoose';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { configureApp } from '../src/bootstrap';
import { User } from '../src/users/user.schema';
import { UserRole } from '../src/common/domain';
import { MailMessage, MailService, MailTransport } from '../src/mail/mail.service';
import { MailJob } from '../src/mail/mail.schema';
import { Notification, NotificationType } from '../src/notifications/notifications.schema';
import { Flight, AirlineProfile } from '../src/flights/flights.schema';
import { FlightBooking } from '../src/flight-bookings/flight-booking.schema';
import { FlightBookingsService } from '../src/flight-bookings/flight-bookings.service';
import { Itinerary } from '../src/itineraries/itineraries.schema';
import { Hotel } from '../src/hotels/hotel.schema';
import { Review } from '../src/hotel-bookings/review.schema';
import { BlogPost } from '../src/blog/blog-post.schema';
import { HotelBooking } from '../src/hotel-bookings/hotel-booking.schema';
import { Payment, Refund } from '../src/payments/payments.schema';

jest.setTimeout(120000);
describe('Bonus APIs on disposable MongoDB; SMTP delivery captured locally', () => {
  let mongo: MongoMemoryReplSet, app: INestApplication, db: Connection;
  let owner: string, other: string, cookies: string[], otherCookies: string[];
  let passwordHash: string;
  const password = 'Secure12345';
  const transport = {
    send: jest.fn<Promise<void>, [MailMessage, string]>().mockResolvedValue(undefined),
  };
  const model = <T>(name: string): Model<T> => db.model<T>(name);
  const write = (method: 'post' | 'put' | 'patch' | 'delete', path: string, auth = cookies) => {
    const server = request(app.getHttpServer());
    return server[method](`/api${path}`)
      .set('Origin', 'http://localhost:5173')
      .set('X-Triplify-CSRF', '1')
      .set('Cookie', auth);
  };
  const get = (path: string, auth = cookies) =>
    request(app.getHttpServer()).get(`/api${path}`).set('Cookie', auth);
  async function account(role = UserRole.USER, providerId?: string) {
    const user = await model<User>(User.name).create({
      name: 'Traveler',
      email: `${new Types.ObjectId()}@example.com`,
      passwordHash,
      role,
      ...(providerId
        ? { providerId, providerType: role === UserRole.HOTEL_MODERATOR ? 'HOTEL' : 'AIRLINE' }
        : {}),
    });
    const response = await write('post', '/auth/login', [])
      .send({ email: user.email, password })
      .expect(200);
    return {
      id: user.id,
      email: user.email,
      cookies: (response.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]),
    };
  }
  async function itinerary(userId = owner, isPublic = false) {
    return model<Itinerary>(Itinerary.name).create({
      userId,
      title: 'Cairo trip',
      countries: ['EG'],
      startDate: '2030-06-01',
      isPublic,
      days: [
        {
          dayNumber: 1,
          date: '2030-06-01',
          cityCode: 'CAI',
          activities: [{ title: 'Museum', cost: 10, currency: 'USD' }],
          budgets: [{ category: 'FOOD', amount: 30, currency: 'USD' }],
        },
      ],
    });
  }
  async function flightFixture(capacity = 3) {
    const provider = new Types.ObjectId();
    const moderator = await account(UserRole.AIRLINE_MODERATOR, String(provider));
    await model<AirlineProfile>(AirlineProfile.name).create({
      _id: provider,
      moderatorId: moderator.id,
      name: 'Fixture Air',
      active: true,
      verified: true,
    });
    const makeFlight = (days: number, price = 100, seats = capacity) =>
      model<Flight>(Flight.name).create({
        airlineId: provider,
        flightNumber: `TR${days}`,
        departureAirport: 'CAI',
        arrivalAirport: 'LHR',
        departureTimeUtc: new Date(Date.now() + days * 86400000),
        arrivalTimeUtc: new Date(Date.now() + days * 86400000 + 3600000),
        departureDate: new Date(Date.now() + days * 86400000).toISOString().slice(0, 10),
        cabins: { economy: { seatCount: seats, price } },
        status: 'SCHEDULED',
        cancellationTiers: [],
      });
    const flight = await makeFlight(10);
    await write('put', `/flights/${flight.id}/seat-map`, moderator.cookies)
      .send({
        cabinClass: 'economy',
        seats: Array.from({ length: capacity }, (_, i) => `${i + 1}A`),
      })
      .expect(200);
    return { flight, makeFlight, moderator };
  }
  async function booking(flightId: string, userId = owner, confirmed = true) {
    const service = app.get(FlightBookingsService);
    const draft = await service.createDraft(userId, {
      legs: [{ flightId, cabinClass: 'economy' }],
      passengers: [
        {
          firstName: 'Ada',
          lastName: 'Test',
          dateOfBirth: '1990-01-01',
          passportNumber: 'TEST123',
          type: 'adult',
        },
      ],
    });
    await service.hold(userId, String(draft._id));
    if (confirmed)
      await model<FlightBooking>(FlightBooking.name).updateOne(
        { _id: draft._id },
        { $set: { status: 'CONFIRMED' }, $unset: { holdExpiresAt: 1 } },
      );
    expect(
      await model<FlightBooking>(FlightBooking.name).findOne({
        _id: draft._id,
        userId,
        firstDeparture: { $gt: new Date() },
        status: confirmed ? 'CONFIRMED' : 'PENDING',
      }),
    ).not.toBeNull();
    return String(draft._id);
  }
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      binary: { version: process.env.MONGOMS_VERSION ?? '7.0.24' },
    });
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = mongo.getUri();
    process.env.JWT_ACCESS_SECRET = 'bonus-test-only-'.repeat(5);
    process.env.FRONTEND_URL = 'http://localhost:5173';
    process.env.COOKIE_SECURE = 'false';
    process.env.MAIL_MODE = 'disabled';
    const { AppModule } = await import('../src/app.module');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailTransport)
      .useValue(transport)
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    configureApp(app);
    await app.init();
    db = app.get<Connection>(getConnectionToken());
    await Promise.all(Object.values(db.models).map((m) => m.init()));
    passwordHash = await hash(password, 4);
  });
  beforeEach(async () => {
    app.get<ThrottlerStorageService>(ThrottlerStorage).onApplicationShutdown();
    app.get(ConfigService).set('MAIL_MODE', 'disabled');
    transport.send.mockReset().mockResolvedValue(undefined);
    await Promise.all(Object.values(db.models).map((m) => m.deleteMany({})));
    const a = await account(),
      b = await account();
    owner = a.id;
    cookies = a.cookies;
    other = b.id;
    otherCookies = b.cookies;
  });
  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });
  async function emailedToken() {
    app.get(ConfigService).set('MAIL_MODE', 'smtp');
    await app.get(MailService).process();
    const text = transport.send.mock.calls.at(-1)?.[0].text;
    expect(text).toBeDefined();
    return /#token=([A-Za-z0-9_-]+)/.exec(text!)![1];
  }

  it('registers, queues an encrypted verification message, and consumes its token once', async () => {
    const result = await write('post', '/auth/register', [])
      .send({ name: 'New traveler', email: 'new@example.com', password, consent: true })
      .expect(201);
    expect(result.body.emailVerified).toBe(false);
    const queued = await model<MailJob>(MailJob.name).findOne().select('+payload').lean();
    expect(queued?.payload).not.toContain('new@example.com');
    expect(queued?.payload).not.toContain('token=');
    const token = await emailedToken();
    await write('post', '/auth/verify-email', []).send({ token }).expect(200);
    await write('post', '/auth/verify-email', []).send({ token }).expect(400);
    const saved = await model<User>(User.name).findOne({ email: 'new@example.com' }).lean();
    expect(saved?.emailVerifiedAt).toBeDefined();
    expect(saved).not.toHaveProperty('verificationHash');
    await app.get(MailService).process();
    expect(transport.send).toHaveBeenCalledTimes(1);
  });
  it('uses generic recovery responses, rejects invalid tokens and revokes existing sessions after reset', async () => {
    const user = await model<User>(User.name).findById(owner);
    const known = await write('post', '/auth/forgot-password', [])
      .send({ email: user!.email })
      .expect(200);
    const unknown = await write('post', '/auth/forgot-password', [])
      .send({ email: 'missing@example.com' })
      .expect(200);
    expect(known.body).toEqual(unknown.body);
    const token = await emailedToken();
    await write('post', '/auth/reset-password', [])
      .send({ token: 'x'.repeat(43), newPassword: 'Changed12345' })
      .expect(400);
    const responses = await Promise.all(
      [1, 2].map(() =>
        write('post', '/auth/reset-password', []).send({ token, newPassword: 'Changed12345' }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
    await get('/auth/me').expect(401);
    await write('post', '/auth/login', [])
      .send({ email: user!.email, password: 'Changed12345' })
      .expect(200);
  });
  it('expires recovery tokens and invalidates them on a normal password change', async () => {
    const user = await model<User>(User.name).findById(owner);
    await write('post', '/auth/forgot-password', []).send({ email: user!.email }).expect(200);
    const token = await emailedToken();
    await model<User>(User.name).updateOne(
      { _id: owner },
      { $set: { recoveryExpiresAt: new Date(0) } },
    );
    await write('post', '/auth/reset-password', [])
      .send({ token, newPassword: 'Changed12345' })
      .expect(400);
    await write('patch', '/users/me/password')
      .send({ currentPassword: password, newPassword: 'Changed12345' })
      .expect(200);
    expect(
      (await model<User>(User.name).findById(owner).select('+recoveryHash'))?.recoveryHash,
    ).toBeUndefined();
  });
  it('retries SMTP failures, serializes workers, and respects email preferences and verification', async () => {
    await model<User>(User.name).updateOne(
      { _id: owner },
      { $set: { emailVerifiedAt: new Date() } },
    );
    await model<Notification>(Notification.name).create({
      userId: owner,
      title: 'Booked',
      message: 'Confirmed',
      type: NotificationType.BOOKING_CONFIRMED,
    });
    await model<Notification>(Notification.name).create({
      userId: other,
      title: 'Unverified',
      message: 'Do not email',
      type: NotificationType.GENERAL,
    });
    app.get(ConfigService).set('MAIL_MODE', 'smtp');
    transport.send.mockRejectedValueOnce(new Error('temporary'));
    await app.get(MailService).process();
    const job = await model<MailJob>(MailJob.name).findOne();
    expect(job?.status).toBe('PENDING');
    await model<MailJob>(MailJob.name).updateMany({}, { $set: { nextAttemptAt: new Date(0) } });
    await Promise.all([app.get(MailService).process(), app.get(MailService).process()]);
    expect(transport.send).toHaveBeenCalledTimes(2);
    expect((await model<MailJob>(MailJob.name).findOne())?.status).toBe('SENT');
    await write('patch', '/auth/email-notifications').send({ enabled: false }).expect(200);
    await model<Notification>(Notification.name).create({
      userId: owner,
      title: 'Opted out',
      message: 'Do not email',
      type: NotificationType.GENERAL,
    });
    await app.get(MailService).process();
    expect(transport.send).toHaveBeenCalledTimes(2);
  });
  it('allows only the assigned hotel moderator to reply, and public reviews display the reply', async () => {
    const hotelId = new Types.ObjectId();
    const moderator = await account(UserRole.HOTEL_MODERATOR, String(hotelId));
    const outsider = await account(UserRole.HOTEL_MODERATOR, String(new Types.ObjectId()));
    await model<Hotel>(Hotel.name).create({
      _id: hotelId,
      name: 'Test hotel',
      description: 'Hotel',
      city: 'Cairo',
      country: 'EG',
      address: 'Test road',
      starClass: 4,
      timeZone: 'Africa/Cairo',
    });
    const review = await model<Review>(Review.name).create({
      bookingId: new Types.ObjectId(),
      hotelId,
      userId: owner,
      rating: 5,
    });
    await write('put', `/reviews/${review.id}/reply`).send({ text: 'Thank you' }).expect(403);
    await write('put', `/reviews/${review.id}/reply`, outsider.cookies)
      .send({ text: 'Thank you' })
      .expect(404);
    await write('put', `/reviews/${review.id}/reply`, moderator.cookies)
      .send({ text: 'Thank you' })
      .expect(200);
    expect(
      (await get(`/hotels/${hotelId}/reviews`, []).expect(200)).body.items[0].moderatorReply.text,
    ).toBe('Thank you');
    await write('delete', `/reviews/${review.id}/reply`, moderator.cookies).expect(200);
    await model<Review>(Review.name).updateOne({ _id: review._id }, { $set: { hidden: true } });
    await write('put', `/reviews/${review.id}/reply`, moderator.cookies)
      .send({ text: 'Hidden' })
      .expect(404);
  });
  it('attaches confirmed bookings idempotently and protects them even on public itineraries', async () => {
    const { flight } = await flightFixture();
    const id = await booking(flight.id);
    const trip = await itinerary(owner, true);
    const path = `/itineraries/${trip.id}/bookings`;
    await write('post', path).send({ type: 'FLIGHT', bookingId: id }).expect(201);
    await write('post', path).send({ type: 'FLIGHT', bookingId: id }).expect(201);
    expect((await get(path).expect(200)).body.items).toHaveLength(1);
    await get(path, otherCookies).expect(404);
    expect(
      JSON.stringify((await get(`/itineraries/public/${trip.id}`, []).expect(200)).body),
    ).not.toContain(id);
    const otherTrip = await itinerary(other);
    await write('post', `/itineraries/${otherTrip.id}/bookings`, otherCookies)
      .send({ type: 'FLIGHT', bookingId: id })
      .expect(409);
    await write('post', `/flight-bookings/${id}/cancel`).expect(201);
    expect((await get(path).expect(200)).body.items[0].status).toBe('CANCELLED');
    await write('post', path).send({ type: 'FLIGHT', bookingId: id }).expect(409);
  });
  it('supports confirmed hotel attachments and rejects pending hotel reservations', async () => {
    const trip = await itinerary();
    const hotel = await model<HotelBooking>(HotelBooking.name).create({
      userId: owner,
      providerId: new Types.ObjectId(),
      hotelName: 'Test Hotel',
      timeZone: 'UTC',
      checkInDate: '2030-06-01',
      checkOutDate: '2030-06-02',
      checkInAt: new Date('2030-06-01'),
      checkOutAt: new Date('2030-06-02'),
      nights: 1,
      rooms: [],
      totalAmountCents: 10000,
      currency: 'USD',
      status: 'PENDING_PAYMENT',
      policy: { checkInTime: '14:00', checkOutTime: '11:00' },
    });
    await write('post', `/itineraries/${trip.id}/bookings`)
      .send({ type: 'HOTEL', bookingId: hotel.id })
      .expect(409);
    await model<HotelBooking>(HotelBooking.name).updateOne(
      { _id: hotel._id },
      { $set: { status: 'CONFIRMED', reference: 'HOTEL123' } },
    );
    await write('post', `/itineraries/${trip.id}/bookings`)
      .send({ type: 'HOTEL', bookingId: hotel.id })
      .expect(201);
    const links = (await get(`/itineraries/${trip.id}/bookings`).expect(200)).body.items;
    expect(links[0].reference).toBe('HOTEL123');
    await write('delete', `/itineraries/${trip.id}/bookings/${links[0].id}`).expect(200);
    expect((await get(`/itineraries/${trip.id}/bookings`).expect(200)).body.items).toEqual([]);
  });
  it('exports a real PDF for the owner and denies other users', async () => {
    const trip = await itinerary();
    const response = await get(`/itineraries/${trip.id}/export.pdf`)
      .expect(200)
      .expect('Content-Type', /application\/pdf/);
    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect((response.body as Buffer).toString()).toContain('%%EOF');
    await get(`/itineraries/${trip.id}/export.pdf`, otherCookies).expect(404);
  });
  it('attaches only owned public itineraries to posts and redacts links when visibility changes', async () => {
    const trip = await itinerary(owner, true),
      privateTrip = await itinerary();
    const post = await model<BlogPost>(BlogPost.name).create({
      authorId: owner,
      title: 'Trip post',
      body: 'My trip',
      status: 'PUBLISHED',
    });
    await write('put', `/blog/posts/${post.id}/itinerary`)
      .send({ itineraryId: privateTrip.id })
      .expect(404);
    await write('put', `/blog/posts/${post.id}/itinerary`, otherCookies)
      .send({ itineraryId: trip.id })
      .expect(404);
    await write('put', `/blog/posts/${post.id}/itinerary`)
      .send({ itineraryId: trip.id })
      .expect(200);
    expect((await get(`/blog/posts/${post.id}`, []).expect(200)).body.itinerary.id).toBe(trip.id);
    await model<Itinerary>(Itinerary.name).updateOne(
      { _id: trip._id },
      { $set: { isPublic: false } },
    );
    expect((await get(`/blog/posts/${post.id}`, []).expect(200)).body.itinerary).toBeNull();
    await write('delete', `/blog/posts/${post.id}/itinerary`).expect(200);
  });
  it('stores favourites once, scopes deletion to owner and redacts hidden resources', async () => {
    const trip = await itinerary(owner, true);
    await write('post', '/favourites').send({ type: 'ITINERARY', targetId: trip.id }).expect(201);
    await write('post', '/favourites').send({ type: 'ITINERARY', targetId: trip.id }).expect(201);
    const list = (await get('/favourites').expect(200)).body;
    expect(list.total).toBe(1);
    expect(list.items[0].target.title).toBe('Cairo trip');
    expect((await get('/favourites', otherCookies).expect(200)).body.total).toBe(0);
    await write('delete', `/favourites/${list.items[0].id}`, otherCookies).expect(200);
    expect((await get('/favourites').expect(200)).body.total).toBe(1);
    await model<Itinerary>(Itinerary.name).updateOne({ _id: trip._id }, { $set: { hidden: true } });
    expect((await get('/favourites').expect(200)).body.items[0].target).toBeNull();
    await write('post', '/favourites').send({ type: 'ITINERARY', targetId: trip.id }).expect(404);
    await write('delete', `/favourites/${list.items[0].id}`).expect(200);
  });
  it('restricts analytics to admins and separates paid/refunded amounts by currency', async () => {
    const admin = await account(UserRole.ADMIN);
    await get('/admin/analytics').expect(403);
    for (const currency of ['USD', 'EGP'])
      await model<Payment>(Payment.name).create({
        bookingId: String(new Types.ObjectId()),
        bookingType: 'FLIGHT',
        userId: owner,
        amount: 100,
        currency,
        stripePaymentIntentId: currency,
        stripeClientSecret: 'test',
        status: 'SUCCEEDED',
      });
    await model<Refund>(Refund.name).create({
      paymentId: 'fixture',
      bookingId: 'fixture',
      bookingType: 'FLIGHT',
      userId: owner,
      amount: 20,
      currency: 'USD',
      reason: 'USER_CANCELLATION',
      refundPercentage: 20,
      status: 'SUCCEEDED',
    });
    const result = (await get('/admin/analytics', admin.cookies).expect(200)).body;
    expect(result.revenue).toEqual(
      expect.arrayContaining([
        { currency: 'USD', paid: 100, refunded: 20, net: 80 },
        { currency: 'EGP', paid: 100, refunded: 0, net: 100 },
      ]),
    );
    expect(JSON.stringify(result)).not.toContain('@example.com');
  });
  it('serializes competing seat selections and releases seats on cancellation', async () => {
    const { flight, moderator } = await flightFixture();
    const a = await booking(flight.id),
      b = await booking(flight.id, other);
    const results = await Promise.all([
      write('put', `/flight-bookings/${a}/seats`).send({ legIndex: 0, seats: ['1A'] }),
      write('put', `/flight-bookings/${b}/seats`, otherCookies).send({
        legIndex: 0,
        seats: ['1A'],
      }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    await write('put', `/flights/${flight.id}/seat-map`, moderator.cookies)
      .send({ cabinClass: 'economy', seats: ['1A', '2A', '3A'] })
      .expect(409);
    await write('put', `/flight-bookings/${a}/seats`, otherCookies)
      .send({ legIndex: 0, seats: ['2A'] })
      .expect(409);
    await write('put', `/flight-bookings/${a}/seats`)
      .send({ legIndex: 0, seats: ['99Z'] })
      .expect(400);
    const winner = results[0].status === 200 ? a : b;
    const winnerCookies = winner === a ? cookies : otherCookies;
    await write('post', `/flight-bookings/${winner}/cancel`, winnerCookies).expect(201);
    const remaining = (await model<Flight>(Flight.name)
      .findById(flight._id)
      .select('+seatAssignments'))!.seatAssignments;
    expect(remaining).toHaveLength(0);
    await write(
      'put',
      `/flight-bookings/${winner === a ? b : a}/seats`,
      winner === a ? otherCookies : cookies,
    )
      .send({ legIndex: 0, seats: ['1A'] })
      .expect(200);
  });
  it('releases selected seats on hold expiry and never exposes assignment owner IDs in flight data', async () => {
    const { flight } = await flightFixture();
    const id = await booking(flight.id, owner, false);
    await write('put', `/flight-bookings/${id}/seats`)
      .send({ legIndex: 0, seats: ['1A'] })
      .expect(200);
    expect(await model<Flight>(Flight.name).findById(flight._id).lean()).not.toHaveProperty(
      'seatAssignments',
    );
    await model<FlightBooking>(FlightBooking.name).updateOne(
      { _id: id },
      { $set: { holdExpiresAt: new Date(0) } },
    );
    await app.get(FlightBookingsService).expireOne(new Types.ObjectId(id));
    expect(
      (await model<Flight>(Flight.name).findById(flight._id).select('+seatAssignments'))!
        .seatAssignments,
    ).toHaveLength(0);
    await write('put', `/flight-bookings/${id}/seats`)
      .send({ legIndex: 0, seats: ['1A'] })
      .expect(409);
  });
  it('changes confirmed flights atomically while preserving payment totals and releasing old assignments', async () => {
    const { flight, makeFlight } = await flightFixture();
    const id = await booking(flight.id);
    const next = await makeFlight(11);
    await write('put', `/flight-bookings/${id}/seats`)
      .send({ legIndex: 0, seats: ['1A'] })
      .expect(200);
    const changed = await write('patch', `/flight-bookings/${id}/change`)
      .send({ legs: [{ flightId: next.id, cabinClass: 'economy' }] })
      .expect(200);
    expect(changed.body.totalPrice).toBe(100);
    expect(changed.body.legs[0].flightId).toBe(next.id);
    expect(
      (await model<Flight>(Flight.name).findById(flight._id).select('+seatAssignments'))!
        .seatAssignments,
    ).toHaveLength(0);
    expect((await model<Flight>(Flight.name).findById(flight._id))!.cabins.economy.seatCount).toBe(
      3,
    );
    expect((await model<Flight>(Flight.name).findById(next._id))!.cabins.economy.seatCount).toBe(2);
    expect(
      await model<Notification>(Notification.name).countDocuments({
        userId: owner,
        type: NotificationType.FLIGHT_SCHEDULE_CHANGED,
      }),
    ).toBe(1);
  });
  it('preserves paid extra bags and baggage terms when changing flights', async () => {
    const { flight, makeFlight } = await flightFixture();
    await model<AirlineProfile>(AirlineProfile.name).updateOne(
      { _id: flight.airlineId },
      { $set: { baggagePolicy: { extraBagPrice: 10, maxExtraBagsPerPassenger: 2 } } },
    );
    const service = app.get(FlightBookingsService);
    const draft = await service.createDraft(owner, {
      legs: [{ flightId: flight.id, cabinClass: 'economy' }],
      passengers: [
        {
          firstName: 'Ada',
          lastName: 'Test',
          dateOfBirth: '1990-01-01',
          passportNumber: 'TEST123',
          type: 'adult',
          extraBags: 1,
        },
      ],
    });
    await service.hold(owner, String(draft._id));
    await model<FlightBooking>(FlightBooking.name).updateOne(
      { _id: draft._id },
      { $set: { status: 'CONFIRMED' }, $unset: { holdExpiresAt: 1 } },
    );
    const next = await makeFlight(11);
    const changed = await write('patch', `/flight-bookings/${draft._id}/change`)
      .send({ legs: [{ flightId: next.id, cabinClass: 'economy' }] })
      .expect(200);
    expect(changed.body.totalPrice).toBe(110);
    expect(changed.body.legs[0].baggageCost).toBe(10);
    expect(changed.body.baggagePolicy.legs[0].flightId).toBe(next.id);
    await model<AirlineProfile>(AirlineProfile.name).updateOne(
      { _id: flight.airlineId },
      { $set: { 'baggagePolicy.extraBagPrice': 15 } },
    );
    await write('patch', `/flight-bookings/${draft._id}/change`)
      .send({ legs: [{ flightId: flight.id, cabinClass: 'economy' }] })
      .expect(409);
  });
  it('releases selected seats when the provider cancels a held flight', async () => {
    const { flight } = await flightFixture();
    const id = await booking(flight.id, owner, false);
    await write('put', `/flight-bookings/${id}/seats`)
      .send({ legIndex: 0, seats: ['1A'] })
      .expect(200);
    await app
      .get(FlightBookingsService)
      .cancelFlightByProvider(flight.id, [String(flight.airlineId)]);
    expect(
      (await model<Flight>(Flight.name).findById(flight._id).select('+seatAssignments'))!
        .seatAssignments,
    ).toHaveLength(0);
    expect((await model<FlightBooking>(FlightBooking.name).findById(id))!.status).toBe('EXPIRED');
  });
  it('rolls back flight changes when fare or availability fails and denies other owners', async () => {
    const { flight, makeFlight } = await flightFixture();
    const id = await booking(flight.id);
    for (const next of [await makeFlight(11, 101), await makeFlight(12, 100, 0)]) {
      await write('patch', `/flight-bookings/${id}/change`)
        .send({ legs: [{ flightId: next.id, cabinClass: 'economy' }] })
        .expect(409);
      expect(
        (await model<Flight>(Flight.name).findById(flight._id))!.cabins.economy.seatCount,
      ).toBe(2);
      expect(
        String((await model<FlightBooking>(FlightBooking.name).findById(id))!.legs[0].flightId),
      ).toBe(flight.id);
    }
    const next = await makeFlight(13);
    await write('patch', `/flight-bookings/${id}/change`, otherCookies)
      .send({ legs: [{ flightId: next.id, cabinClass: 'economy' }] })
      .expect(409);
  });
  it('allows only one competing change to take the final seat on the replacement flight', async () => {
    const { flight, makeFlight } = await flightFixture();
    const a = await booking(flight.id),
      b = await booking(flight.id, other);
    const next = await makeFlight(11, 100, 1);
    const results = await Promise.all([
      write('patch', `/flight-bookings/${a}/change`).send({
        legs: [{ flightId: next.id, cabinClass: 'economy' }],
      }),
      write('patch', `/flight-bookings/${b}/change`, otherCookies).send({
        legs: [{ flightId: next.id, cabinClass: 'economy' }],
      }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await model<Flight>(Flight.name).findById(next._id))!.cabins.economy.seatCount).toBe(0);
    expect((await model<Flight>(Flight.name).findById(flight._id))!.cabins.economy.seatCount).toBe(
      2,
    );
  });
});
