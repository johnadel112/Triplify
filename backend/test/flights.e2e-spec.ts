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
    cabins: { economy: { seatCount: 2, price: 320 }, business: { seatCount: 1, price: 900 } },
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
    expect(updated.body.cabins.economy).toEqual({ seatCount: 0, price: 350 });
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
});
