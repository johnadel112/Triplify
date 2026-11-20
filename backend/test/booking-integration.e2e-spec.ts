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
import { configureApp } from '../src/bootstrap';
import { FlightBooking } from '../src/flight-bookings/flight-booking.schema';
import { AirlineProfile, Flight } from '../src/flights/flights.schema';
import { HotelBooking } from '../src/hotel-bookings/hotel-booking.schema';
import { HotelBookingStatus } from '../src/hotel-bookings/hotel-bookings.constants';
import { Payment, Refund, PolicyAcceptance } from '../src/payments/payments.schema';
import { PaymentsService } from '../src/payments/payments.service';
import { BookingType } from '../src/payments/payments.constants';
import { FlightBookingsService } from '../src/flight-bookings/flight-bookings.service';
import { UsersService } from '../src/users/users.service';
import { Notification } from '../src/notifications/notifications.schema';
import { signedEvent, webhookTestSecret } from './stripe-test-signature';
import { RefundsService } from '../src/payments/refunds.service';
import { Hotel } from '../src/hotels/hotel.schema';
import { AdminService } from '../src/admin/admin.service';
import { NotificationsService } from '../src/notifications/notifications.service';

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
  let hotels: Model<Hotel>;
  let passwordHash: string;
  const password = 'Secure12345';
  const now = () => Date.now();
  const refundCreate = jest.fn();
  const refundRetrieve = jest.fn();

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  const post = (path: string, cookies: string[]) =>
    request(server())
      .post(`/api${path}`)
      .set('Origin', 'http://localhost:5173')
      .set('X-Triplify-CSRF', '1')
      .set('Cookie', cookies);
  const get = (path: string, cookies: string[]) =>
    request(server()).get(`/api${path}`).set('Cookie', cookies);
  const patch = (path: string, cookies: string[]) =>
    request(server()).patch(`/api${path}`).set('Origin', 'http://localhost:5173')
      .set('X-Triplify-CSRF', '1').set('Cookie', cookies);

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
    process.env.STRIPE_WEBHOOK_SECRET = webhookTestSecret;
    const { AppModule } = await import('../src/app.module.js');
    // Booking and provider integration adapters are real in this suite.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.useLogger(false);
    configureApp(app);
    await app.init();
    users = app.get(getModelToken(User.name));
    hotelBookings = app.get(getModelToken(HotelBooking.name));
    flightBookings = app.get(getModelToken(FlightBooking.name));
    flights = app.get(getModelToken(Flight.name));
    airlines = app.get(getModelToken(AirlineProfile.name));
    hotels = app.get(getModelToken(Hotel.name));
    Object.assign(app.get(RefundsService), { stripe: { refunds: { create: refundCreate, retrieve: refundRetrieve } } });
    const db = app.get<Connection>(getConnectionToken());
    await Promise.all(Object.values(db.models).map((model) => model.init()));
    passwordHash = await hash(password, 10);
  });

  beforeEach(async () => {
    refundCreate.mockReset().mockResolvedValue({ id: 're_test_fixture', status: 'succeeded' });
    refundRetrieve.mockReset().mockResolvedValue({ id: 're_test_fixture', status: 'succeeded' });
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
      airlineId: airline._id,
      departureAirport: 'CAI',
      arrivalAirport: 'JFK',
      departureTimeUtc: new Date(now() + 30 * DAY),
      arrivalTimeUtc: new Date(now() + 30 * DAY + 3600 * 1000),
      departureDate: '2030-01-01',
      cabins: { economy: { seatCount: 10, price: 300 } },
      cancellationTiers: [{ hoursBeforeDeparture: 48, refundPercentage: 50 }],
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

  async function pendingPaidFlight() {
    const traveler = await account();
    const { flight } = await airlineFlight();
    const service = app.get(FlightBookingsService);
    const draft = await service.createDraft(traveler.user.id as string, {
      legs: [{ flightId: flight.id as string, cabinClass: 'economy' }],
      passengers: [{ firstName: 'A', lastName: 'B', dateOfBirth: '1990-01-01', passportNumber: 'X1', type: 'adult' }],
    });
    await service.hold(traveler.user.id as string, String(draft._id));
    const payment = await app.get<Model<Payment>>(getModelToken(Payment.name)).create({
      bookingId: String(draft._id), bookingType: 'FLIGHT', userId: traveler.user._id,
      amount: 300, currency: 'USD', status: 'PENDING', stripePaymentIntentId: `pi_${draft._id}`, stripeClientSecret: 'test-only',
    });
    const intent = { id: payment.stripePaymentIntentId, status: 'succeeded', amount_received: 30000, currency: 'usd',
      metadata: { bookingId: payment.bookingId, bookingType: 'FLIGHT', userId: traveler.user.id as string } };
    return { traveler, draft, payment, intent, service };
  }

  const webhook = (type: string, object: object) => {
    const signed = signedEvent({ type, data: { object } });
    return request(server()).post('/api/payments/webhook').set('Content-Type', 'application/json')
      .set('stripe-signature', signed.signature).send(signed.payload);
  };

  it('FLT-23/PAY-01: signed payment confirms once; late failure cannot regress success', async () => {
    const { draft, payment, intent } = await pendingPaidFlight();
    await Promise.all([webhook('payment_intent.succeeded', intent).expect(201), webhook('payment_intent.succeeded', intent).expect(201)]);
    await webhook('payment_intent.payment_failed', { ...intent, last_payment_error: { message: 'old failure' } }).expect(201);
    expect((await flightBookings.findById(draft._id))?.status).toBe('CONFIRMED');
    expect((await app.get<Model<Payment>>(getModelToken(Payment.name)).findById(payment._id))?.status).toBe('SUCCEEDED');
    expect(await app.get<Model<Notification>>(getModelToken(Notification.name)).countDocuments({ 'metadata.bookingId': String(draft._id), type: 'BOOKING_CONFIRMED' })).toBe(1);
  });

  it('PAY-01: rejects signed events with incorrect amount or owner metadata', async () => {
    const { draft, payment, intent } = await pendingPaidFlight();
    await webhook('payment_intent.succeeded', { ...intent, amount_received: 1 }).expect(400);
    await webhook('payment_intent.succeeded', { ...intent, metadata: { ...intent.metadata, userId: String(new Types.ObjectId()) } }).expect(400);
    expect((await flightBookings.findById(draft._id))?.status).toBe('PENDING');
    expect((await app.get<Model<Payment>>(getModelToken(Payment.name)).findById(payment._id))?.status).toBe('PENDING');
  });

  it('PAY-01: late payment cannot resurrect an expired flight hold and records refund work', async () => {
    const { draft, payment, intent, service } = await pendingPaidFlight();
    await flightBookings.updateOne({ _id: draft._id }, { $set: { holdExpiresAt: new Date(0) } });
    await service.expireOne(draft._id);
    await webhook('payment_intent.succeeded', intent).expect(201);
    expect((await flightBookings.findById(draft._id))?.status).toBe('EXPIRED');
    expect((await app.get<Model<Payment>>(getModelToken(Payment.name)).findById(payment._id))?.status).toBe('REFUNDED');
  });

  it('PAY-01: concurrent creation uses one payment record and the server price', async () => {
    const { traveler, draft, payment } = await pendingPaidFlight();
    const model = app.get<Model<Payment>>(getModelToken(Payment.name));
    await model.deleteOne({ _id: payment._id });
    await app.get<Model<PolicyAcceptance>>(getModelToken(PolicyAcceptance.name)).create({
      bookingId: String(draft._id), bookingType: 'FLIGHT', userId: traveler.user._id, accepted: true,
    });
    const service = app.get(PaymentsService);
    const originalStripe = Reflect.get(service, 'stripe');
    const originalConfig = Reflect.get(service, 'configService');
    const create = jest.fn().mockResolvedValue({ id: 'pi_concurrent_fixture', client_secret: 'secret_fixture' });
    Object.assign(service, { stripe: { paymentIntents: { create } }, configService: { get: () => 'sk_test_fixture' } });
    try {
      const responses = await Promise.all([
        post('/payments', traveler.cookies).send({ bookingId: String(draft._id), bookingType: 'FLIGHT', amount: 1 }).expect(201),
        post('/payments', traveler.cookies).send({ bookingId: String(draft._id).toUpperCase(), bookingType: 'FLIGHT', amount: 2 }).expect(201),
      ]);
      expect(responses[0].body.paymentId).toBe(responses[1].body.paymentId);
      expect(responses.every(r => r.body.amount === 300)).toBe(true);
      expect(await model.countDocuments({ bookingId: String(draft._id) })).toBe(1);
      for (const call of create.mock.calls) expect(call).toEqual([
        expect.objectContaining({ amount: 30000, currency: 'usd' }),
        { idempotencyKey: `booking:FLIGHT:${draft._id}` },
      ]);
    } finally { Object.assign(service, { stripe: originalStripe, configService: originalConfig }); }
  });

  it('FLT-26/PAY-03: cancellation uses the snapshot, ignores forged refund tiers, and deduplicates retries', async () => {
    const { traveler, draft, intent } = await pendingPaidFlight();
    await webhook('payment_intent.succeeded', intent).expect(201);
    await post(`/flight-bookings/${draft._id}/cancel`, traveler.cookies).send({}).expect(201);
    const refunds = app.get(RefundsService);
    await Promise.all([1, 2].map(() => refunds.processRefund(traveler.user.id as string, {
      bookingId: String(draft._id), bookingType: BookingType.FLIGHT, reason: 'PROVIDER_CANCELLATION', daysBefore: 999,
    })));
    expect(refundCreate).toHaveBeenCalledTimes(1);
    expect(refundCreate).toHaveBeenCalledWith(expect.objectContaining({ amount: 15000 }), expect.objectContaining({ idempotencyKey: expect.any(String) }));
    expect(await app.get<Model<Refund>>(getModelToken(Refund.name)).countDocuments({ bookingId: String(draft._id) })).toBe(1);
    expect(await app.get<Model<Notification>>(getModelToken(Notification.name)).countDocuments({ 'metadata.bookingId': String(draft._id), type: 'REFUND_ISSUED' })).toBe(1);
  });

  it('PAY-03: rejects refunds before cancellation and for another owner', async () => {
    const { traveler, draft, intent } = await pendingPaidFlight();
    await webhook('payment_intent.succeeded', intent).expect(201);
    const dto = { bookingId: String(draft._id), bookingType: BookingType.FLIGHT, reason: 'PROVIDER_CANCELLATION' as const };
    await expect(app.get(RefundsService).processRefund(traveler.user.id as string, dto)).rejects.toThrow('Cancel the booking');
    await expect(app.get(RefundsService).processRefund(String(new Types.ObjectId()), dto)).rejects.toThrow('Booking not found');
    expect(refundCreate).not.toHaveBeenCalled();
  });

  it('PAY-03: pending provider refunds reconcile without a second create request', async () => {
    const { traveler, draft, intent } = await pendingPaidFlight();
    await webhook('payment_intent.succeeded', intent).expect(201);
    refundCreate.mockResolvedValueOnce({ id: 're_pending_fixture', status: 'pending' });
    const cancellation = await post(`/flight-bookings/${draft._id}/cancel`, traveler.cookies).send({}).expect(201);
    expect(cancellation.body.refundStatus).toBe('PENDING');
    await app.get(RefundsService).reconcileRefunds();
    expect((await flightBookings.findById(draft._id))?.refundStatus).toBe('SUCCEEDED');
    expect(refundCreate).toHaveBeenCalledTimes(1);
    expect(refundRetrieve).toHaveBeenCalledWith('re_pending_fixture');
  });

  it('PAY-03: provider errors persist a failed job that can be retried safely', async () => {
    const { traveler, draft, intent } = await pendingPaidFlight();
    await webhook('payment_intent.succeeded', intent).expect(201);
    refundCreate.mockRejectedValueOnce(new Error('offline'));
    await post(`/flight-bookings/${draft._id}/cancel`, traveler.cookies).send({}).expect(503);
    expect((await flightBookings.findById(draft._id))?.refundStatus).toBe('FAILED');
    await app.get(RefundsService).reconcileRefunds();
    expect((await flightBookings.findById(draft._id))?.refundStatus).toBe('SUCCEEDED');
    expect(refundCreate.mock.calls[0][1]).toEqual(refundCreate.mock.calls[1][1]);
  });

  it('PAY-02: returns and stores the owned flight policy snapshot, never hardcoded tiers', async () => {
    const { traveler, draft } = await pendingPaidFlight();
    const policies = await get(`/bookings/FLIGHT/${draft._id}/policies`, traveler.cookies).expect(200);
    expect(policies.body.policies).toMatchObject({
      cancellationPolicy: { tiers: [{ hoursBeforeDeparture: 48, refundPercentage: 50 }] },
      baggagePolicy: { legs: [{ extraBaggagePricePerKg: 0, currency: 'USD' }] },
    });
    const accepted = await post(`/bookings/FLIGHT/${draft._id}/accept-policies`, traveler.cookies)
      .send({ accepted: true }).expect(201);
    expect(accepted.body.accepted).toBe(true);
    const stored = await app.get<Model<PolicyAcceptance>>(getModelToken(PolicyAcceptance.name))
      .findOne({ bookingId: String(draft._id), userId: traveler.user._id }).lean();
    expect(stored?.snapshotPolicies).toEqual(policies.body.policies);
    const stranger = await account();
    await get(`/bookings/FLIGHT/${draft._id}/policies`, stranger.cookies).expect(404);
  });

  it('PAY-02: returns the hotel policy snapshot attached to the booking', async () => {
    const traveler = await account();
    const booking = await hotelBooking(traveler.user._id, HotelBookingStatus.PENDING_PAYMENT, 5);
    await hotelBookings.updateOne({ _id: booking._id }, { $set: { policy: {
      checkInTime: '16:30', checkOutTime: '10:15', cancellationTiers: [{ daysBefore: 9, refundPercentage: 75 }],
    } } });
    const policies = await get(`/bookings/HOTEL/${booking._id}/policies`, traveler.cookies).expect(200);
    expect(policies.body.policies).toEqual({
      checkInTime: '16:30', checkOutTime: '10:15',
      cancellationPolicy: { tiers: [{ daysBefore: 9, refundPercentage: 75 }] },
    });
  });

  it('ACC-15: admins verify and deactivate real providers; public search excludes inactive airlines', async () => {
    const admin = await account(UserRole.ADMIN);
    const { airline, flight } = await airlineFlight();
    await airlines.updateOne({ _id: airline._id }, { $set: { verified: false, active: false } });
    await patch(`/admin/providers/airlines/${airline._id}/verify`, admin.cookies).expect(200);
    await patch(`/admin/providers/airlines/${airline._id}/reactivate`, admin.cookies).expect(200);
    expect((await airlines.findById(airline._id))?.toObject()).toMatchObject({ verified: true, active: true });
    expect((await get('/flights/search?origin=CAI&destination=JFK', admin.cookies)).body.outbound).toHaveLength(1);
    await patch(`/admin/providers/airlines/${airline._id}/deactivate`, admin.cookies).expect(200);
    expect((await get('/flights/search?origin=CAI&destination=JFK', admin.cookies)).body.outbound).toHaveLength(0);
    expect(await flights.exists({ _id: flight._id })).toBeTruthy();

    const hotel = await hotels.create({ name: 'Provider Hotel', description: 'A hotel', city: 'Cairo',
      country: 'Egypt', address: '1 Nile St', starClass: 4, timeZone: 'Africa/Cairo', active: false, verified: false });
    await patch(`/admin/providers/hotels/${hotel._id}/verify`, admin.cookies).expect(200);
    await patch(`/admin/providers/hotels/${hotel._id}/reactivate`, admin.cookies).expect(200);
    expect((await hotels.findById(hotel._id))?.toObject()).toMatchObject({ verified: true, active: true });
  });

  it('GEN-01, ACC-15, ACC-16: admin actions notify the affected people exactly once', async () => {
    const admin = await account(UserRole.ADMIN);
    const traveler = await account();
    const hotel = await hotels.create({ name: 'Notify Hotel', description: 'A hotel', city: 'Cairo',
      country: 'Egypt', address: '1 Nile St', starClass: 4, timeZone: 'Africa/Cairo', active: true, verified: true });
    const moderator = await users.create({
      name: 'Hotel Mod', email: `${new Types.ObjectId().toString()}@example.com`, passwordHash,
      role: UserRole.HOTEL_MODERATOR, providerId: hotel._id, providerType: 'HOTEL',
    });
    const booking = await hotelBooking(traveler.user._id, HotelBookingStatus.CONFIRMED, 10);
    await hotelBookings.updateOne({ _id: booking._id }, { $set: { providerId: hotel._id } });
    const notes = app.get<Model<Notification>>(getModelToken(Notification.name));
    const sender = app.get(NotificationsService);

    await patch(`/admin/providers/hotels/${hotel._id}/deactivate`, admin.cookies).expect(200);
    expect(await sender.dispatchPending()).toBe(1);
    expect(await notes.countDocuments({ userId: moderator._id, type: 'PROVIDER_STATUS_CHANGED' })).toBe(1);
    const travelerNote = await notes.findOne({ userId: traveler.user._id, type: 'PROVIDER_STATUS_CHANGED' }).lean();
    expect(travelerNote?.message).toContain('remains valid');
    expect(await sender.dispatchPending()).toBe(0);
    expect(await notes.countDocuments({ type: 'PROVIDER_STATUS_CHANGED' })).toBe(2);

    await patch(`/admin/users/${traveler.user._id}/suspend`, admin.cookies).expect(200);
    expect(await sender.dispatchPending()).toBe(1);
    expect(await notes.countDocuments({ userId: traveler.user._id, type: 'ACCOUNT_STATUS_CHANGED' })).toBe(1);
  });

  it('ACC-12: overlapping deactivation and confirmation cannot both commit', async () => {
    const { traveler, draft, payment, service } = await pendingPaidFlight();
    await app.get<Model<Payment>>(getModelToken(Payment.name)).updateOne({ _id: payment._id }, { $set: { status: 'SUCCEEDED' } });
    const original = users.updateOne.bind(users);
    let arrivals = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const spy = jest.spyOn(users, 'updateOne').mockImplementation(((...args: Parameters<typeof users.updateOne>) => {
      const operation = original(...args);
      if (arrivals >= 2) return operation;
      arrivals++;
      if (arrivals === 2) release();
      return gate.then(() => operation);
    }) as typeof users.updateOne);
    try {
      const results = await Promise.allSettled([
        service.confirmPayment(String(draft._id), String(payment._id)),
        app.get(UsersService).deactivate({ id: traveler.user.id as string, name: traveler.user.name, role: UserRole.USER,
          status: AccountStatus.ACTIVE, mustChangePassword: false, authVersion: 0, sessionId: '' }),
      ]);
      expect(arrivals).toBe(2);
      const accountState = await users.findById(traveler.user._id);
      const bookingState = await flightBookings.findById(draft._id);
      expect(accountState?.status === AccountStatus.DEACTIVATED && bookingState?.status === 'CONFIRMED').toBe(false);
      if (bookingState?.status === 'CONFIRMED') expect(results[1].status).toBe('rejected');
      else expect(accountState?.status).toBe(AccountStatus.DEACTIVATED);
    } finally { spy.mockRestore(); }
  });

  it('ACC-15: overlapping airline deactivation and confirmation cannot both commit', async () => {
    const admin = await account(UserRole.ADMIN);
    const { draft, payment, service } = await pendingPaidFlight();
    const booking = await flightBookings.findById(draft._id).lean();
    const flight = await flights.findById(booking!.legs[0].flightId).lean();
    await app.get<Model<Payment>>(getModelToken(Payment.name)).updateOne({ _id: payment._id }, { $set: { status: 'SUCCEEDED' } });
    const original = airlines.updateOne.bind(airlines);
    let arrivals = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const spy = jest.spyOn(airlines, 'updateOne').mockImplementation(((...args: Parameters<typeof airlines.updateOne>) => {
      const operation = original(...args);
      if (arrivals >= 2) return operation;
      arrivals++;
      if (arrivals === 2) release();
      return gate.then(() => operation);
    }) as typeof airlines.updateOne);
    try {
      await Promise.allSettled([
        service.confirmPayment(String(draft._id), String(payment._id)),
        app.get(AdminService).provider({ id: admin.user.id as string, name: admin.user.name, role: UserRole.ADMIN,
          status: AccountStatus.ACTIVE, mustChangePassword: false, authVersion: 0, sessionId: '' },
        'AIRLINE', flight!.airlineId.toString(), false),
      ]);
      expect(arrivals).toBe(2);
      const provider = await airlines.findById(flight!.airlineId);
      const finalBooking = await flightBookings.findById(draft._id);
      // Confirm-then-deactivate is valid (existing confirmed bookings remain valid). In that
      // outcome MongoDB must have aborted/retried one callback, proving a serialized order.
      if (provider?.active === false && finalBooking?.status === 'CONFIRMED') {
        expect(spy.mock.calls.length).toBeGreaterThan(2);
      } else {
        expect(finalBooking?.status).not.toBe('CONFIRMED');
        expect(provider?.active).toBe(false);
      }
    } finally { spy.mockRestore(); }
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
