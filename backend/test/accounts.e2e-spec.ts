import 'reflect-metadata';
import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { Connection, Model, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { hash } from 'bcryptjs';
import { AccountStatus, CLOCK, UserRole } from '../src/common/domain';
import { User } from '../src/users/user.schema';
import { Session } from '../src/auth/session.schema';
import { Airport, City, Country, Currency } from '../src/reference-data/reference.schema';
import { seedAdmin, seedReference } from '../src/database/seeding';
import { AuditLog, NotificationOutbox } from '../src/audit/audit.schema';
import { AuditService } from '../src/audit/audit.service';
import { BOOKING_ACCESS, BOOKING_READER, PROVIDER_MANAGEMENT } from '../src/integrations/contracts';
import { configureApp } from '../src/bootstrap';

describe('Accounts API with real disposable MongoDB replica set; external adapters mocked', () => {
  let mongo: MongoMemoryReplSet,
    app: INestApplication,
    users: Model<User>,
    sessions: Model<Session>;
  let now = new Date('2026-10-31T12:00:00Z');
  let passwordHash: string;
  const password = 'Secure12345';
  const bookingAccess = { hasUpcomingConfirmedBookings: jest.fn() };
  const bookingReader = { findBookings: jest.fn() };
  const providers = { verifyProvider: jest.fn(), setProviderActive: jest.fn() };
  const csrf = (test: request.Test) =>
    test.set('Origin', 'http://localhost:5173').set('X-Triplify-CSRF', '1');
  const post = (path: string) => csrf(request(app.getHttpServer()).post(`/api${path}`));
  const patch = (path: string) => csrf(request(app.getHttpServer()).patch(`/api${path}`));
  const get = (path: string) => request(app.getHttpServer()).get(`/api${path}`);
  const cookie = (response: request.Response): string[] =>
    (response.headers['set-cookie'] as unknown as string[]).map((value) => value.split(';')[0]);
  async function account(role = UserRole.USER, extra: Record<string, unknown> = {}) {
    return users.create({
      name: 'Test Account',
      email: `${new Types.ObjectId()}@example.com`,
      passwordHash,
      role,
      ...extra,
    });
  }
  async function login(email: string, secret = password) {
    return post('/auth/login').send({ email, password: secret });
  }
  async function authenticated(role = UserRole.USER, extra: Record<string, unknown> = {}) {
    const user = await account(role, extra);
    const response = await login(user.email);
    expect(response.status).toBe(200);
    return { user, cookies: cookie(response), response };
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
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue({ now: () => new Date(now) })
      .overrideProvider(BOOKING_ACCESS)
      .useValue(bookingAccess)
      .overrideProvider(BOOKING_READER)
      .useValue(bookingReader)
      .overrideProvider(PROVIDER_MANAGEMENT)
      .useValue(providers)
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    configureApp(app);
    await app.init();
    users = app.get(getModelToken(User.name));
    sessions = app.get(getModelToken(Session.name));
    const db = app.get<Connection>(getConnectionToken());
    await Promise.all(Object.values(db.models).map((model) => model.init()));
    passwordHash = await hash(password, 12);
  });
  beforeEach(async () => {
    app.get<ThrottlerStorageService>(ThrottlerStorage).onApplicationShutdown();
    const db = app.get<Connection>(getConnectionToken());
    await Promise.all(Object.values(db.models).map((model) => model.deleteMany({})));
    now = new Date(); // JWT wall clock remains real; injected business clock controls idle/lockout deterministically.
    bookingAccess.hasUpcomingConfirmedBookings.mockReset().mockResolvedValue(false);
    bookingReader.findBookings
      .mockReset()
      .mockResolvedValue({ items: [], total: 0, page: 1, pageCount: 0 });
    providers.verifyProvider.mockReset().mockResolvedValue(true);
    providers.setProviderActive.mockReset().mockResolvedValue(undefined);
    await app
      .get<Model<Currency>>(getModelToken(Currency.name))
      .create({ code: 'USD', name: 'US Dollar', minorUnits: 2 });
  });
  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });
  it('registers normalized email, hashes password and never returns credentials', async () => {
    const response = await post('/auth/register')
      .send({ name: ' Jane ', email: ' JANE@example.com ', password, consent: true })
      .expect(201);
    expect(response.body).toMatchObject({ name: 'Jane', email: 'jane@example.com', role: 'USER' });
    expect(JSON.stringify(response.body)).not.toMatch(
      /passwordHash|refreshHash|authVersion|loginRevision/,
    );
    expect(
      (await users.findOne({ email: 'jane@example.com' }).select('+passwordHash'))!.passwordHash,
    ).not.toBe(password);
  });
  it('rejects duplicate email including concurrent registration', async () => {
    const body = { name: 'Jane', email: 'jane@example.com', password, consent: true };
    const results = await Promise.all([
      post('/auth/register').send(body),
      post('/auth/register').send(body),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });
  it.each([
    { email: 'invalid' },
    { password: 'weak' },
    { consent: false },
    { consent: undefined },
    { role: 'ADMIN' },
    { providerId: new Types.ObjectId().toString() },
  ])('rejects crafted registration %j', async (fields) => {
    const response = await post('/auth/register')
      .send({ name: 'Jane', email: 'jane@example.com', password, consent: true, ...fields })
      .expect(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
    expect(response.body.fields.length).toBeGreaterThan(0);
  });
  it('logs in with secure cookie attributes and role hint', async () => {
    const { response } = await authenticated();
    expect(response.body.routeHint).toBe('/dashboard');
    expect(response.body.access).toBeUndefined();
    expect(response.headers['set-cookie'][0]).toMatch(/HttpOnly/);
    expect(response.headers['set-cookie'][0]).toMatch(/SameSite=Lax/);
  });
  it('uses identical invalid-credential messages for unknown and wrong passwords', async () => {
    const user = await account();
    const wrong = await login(user.email, 'wrong');
    const missing = await login('absent@example.com', 'wrong');
    expect(wrong.status).toBe(401);
    expect(wrong.body.message).toBe('Invalid email or password');
    expect(missing.body).toEqual(wrong.body);
  });
  it('locks attempts 1-5, denies correct credentials during lockout, recovers after 15 minutes', async () => {
    const user = await account();
    for (let i = 1; i <= 5; i++) {
      const result = await login(user.email, 'wrong');
      expect(result.status).toBe(i === 5 ? 429 : 401);
    }
    expect((await login(user.email)).status).toBe(429);
    now = new Date(now.getTime() + 15 * 60 * 1000 + 1);
    expect((await login(user.email)).status).toBe(200);
    const recovered = await users.findById(user._id).select('+failedLoginAttempts +lockedUntil');
    expect(recovered!.failedLoginAttempts).toBe(0);
    expect(recovered!.lockedUntil).toBeUndefined();
  });
  it('resets failure counter after successful login', async () => {
    const user = await account();
    await login(user.email, 'wrong');
    await login(user.email);
    expect(
      (await users.findById(user._id).select('+failedLoginAttempts'))!.failedLoginAttempts,
    ).toBe(0);
  });
  it('serializes concurrent failed logins without lost increments', async () => {
    const user = await account();
    const results = await Promise.all(Array.from({ length: 5 }, () => login(user.email, 'wrong')));
    expect(results.filter((r) => r.status === 401)).toHaveLength(4);
    expect(results.filter((r) => r.status === 429)).toHaveLength(1);
    expect(
      (await users.findById(user._id).select('+failedLoginAttempts'))!.failedLoginAttempts,
    ).toBe(5);
  });
  it.each([AccountStatus.SUSPENDED, AccountStatus.DEACTIVATED])(
    'rejects %s accounts and does not reveal status on wrong password',
    async (status) => {
      const user = await account(UserRole.USER, { status });
      expect((await login(user.email)).status).toBe(status === AccountStatus.SUSPENDED ? 403 : 401);
      expect((await login(user.email, 'wrong')).body.message).toBe('Invalid email or password');
    },
  );
  it('revokes both access and refresh on logout', async () => {
    const { cookies } = await authenticated();
    await post('/auth/logout').set('Cookie', cookies).expect(200);
    await get('/auth/me').set('Cookie', cookies).expect(401);
    await post('/auth/refresh').set('Cookie', cookies).expect(401);
  });
  it('rotates refresh tokens and revokes session on replay', async () => {
    const { cookies } = await authenticated();
    const fresh = await post('/auth/refresh').set('Cookie', cookies).expect(200);
    expect(cookie(fresh)[1]).not.toBe(cookies[1]);
    await post('/auth/refresh').set('Cookie', cookies).expect(401);
    await get('/auth/me').set('Cookie', cookie(fresh)).expect(401);
  });
  it('stores only refresh hashes and rejects absolute expiry despite valid access JWT', async () => {
    const { cookies, user } = await authenticated();
    const session = await sessions.findOne({ userId: user.id }).select('+refreshHash');
    expect(session!.refreshHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(session)).not.toContain(cookies[1].split('=')[1]);
    await sessions.updateOne(
      { _id: session!._id },
      { $set: { expiresAt: new Date(now.getTime() - 1) } },
    );
    await get('/auth/me').set('Cookie', cookies).expect(401);
    await post('/auth/refresh').set('Cookie', cookies).expect(401);
  });
  it('allows only one concurrent rotation and revokes the raced session', async () => {
    const { cookies } = await authenticated();
    const results = await Promise.all([
      post('/auth/refresh').set('Cookie', cookies),
      post('/auth/refresh').set('Cookie', cookies),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    await get('/auth/me').set('Cookie', cookies).expect(401);
  });
  it('expires idle sessions exactly at 30 minutes despite a cryptographically valid access token', async () => {
    const { cookies } = await authenticated();
    now = new Date(now.getTime() + 30 * 60 * 1000);
    await get('/auth/me').set('Cookie', cookies).expect(401);
    await post('/auth/refresh').set('Cookie', cookies).expect(401);
  });
  it('persists activity from ordinary authenticated calls and handles concurrent touches', async () => {
    const { cookies, user } = await authenticated();
    now = new Date(now.getTime() + 29 * 60 * 1000);
    const results = await Promise.all(
      Array.from({ length: 4 }, () => get('/auth/me').set('Cookie', cookies)),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect((await sessions.findOne({ userId: user.id }))!.lastActivityAt).toEqual(now);
    now = new Date(now.getTime() + 29 * 60 * 1000);
    await get('/auth/me').set('Cookie', cookies).expect(200);
  });
  it('edits safe profile fields and rejects unsupported currencies and administrative fields', async () => {
    const { cookies } = await authenticated();
    await patch('/users/me')
      .set('Cookie', cookies)
      .send({ name: 'Updated', preferredCurrency: 'USD' })
      .expect(200);
    expect((await get('/users/me').set('Cookie', cookies)).body.name).toBe('Updated');
    await patch('/users/me').set('Cookie', cookies).send({ preferredCurrency: 'ZZZ' }).expect(400);
    await patch('/users/me').set('Cookie', cookies).send({ role: 'ADMIN' }).expect(400);
  });
  it('rejects wrong current password and invalidates every session after password change', async () => {
    const { cookies, user } = await authenticated();
    const other = await login(user.email);
    await patch('/users/me/password')
      .set('Cookie', cookies)
      .send({ currentPassword: 'wrong', newPassword: 'NewPassword123' })
      .expect(400);
    await patch('/users/me/password')
      .set('Cookie', cookies)
      .send({ currentPassword: password, newPassword: 'NewPassword123' })
      .expect(200);
    await get('/auth/me').set('Cookie', cookies).expect(401);
    await get('/auth/me').set('Cookie', cookie(other)).expect(401);
    expect((await login(user.email, 'NewPassword123')).status).toBe(200);
  });
  it('admin reset revokes sessions and enforces mandatory password change on direct API calls', async () => {
    const admin = await authenticated(UserRole.ADMIN);
    const user = await authenticated();
    const reset = await post(`/admin/users/${user.user.id}/reset-password`)
      .set('Cookie', admin.cookies)
      .expect(201);
    expect(reset.headers['cache-control']).toBe('no-store');
    await get('/auth/me').set('Cookie', user.cookies).expect(401);
    const temporary = await login(user.user.email, reset.body.temporaryPassword);
    expect(temporary.body.routeHint).toBe('/change-password');
    const restricted = cookie(temporary);
    await get('/auth/me').set('Cookie', restricted).expect(200);
    await get('/users/me').set('Cookie', restricted).expect(403);
    await patch('/users/me').set('Cookie', restricted).send({ name: 'Bypass' }).expect(403);
    await patch('/users/me/password')
      .set('Cookie', restricted)
      .send({ currentPassword: reset.body.temporaryPassword, newPassword: 'Permanent123' })
      .expect(200);
    expect((await login(user.user.email, 'Permanent123')).body.user.mustChangePassword).toBe(false);
    const audit = await app.get<Model<AuditLog>>(getModelToken(AuditLog.name)).find().lean();
    expect(JSON.stringify(audit)).not.toContain(reset.body.temporaryPassword);
  });
  it('blocks unauthenticated and ordinary users from administration', async () => {
    expect((await get('/users/me')).body.code).toBe('AUTHENTICATION_REQUIRED');
    const { cookies } = await authenticated();
    await get('/admin/users').set('Cookie', cookies).expect(403);
    await get('/admin/bookings').set('Cookie', cookies).expect(403);
  });
  it('fails deactivation with blocking bookings or unavailable adapter and succeeds with no bookings', async () => {
    const { cookies, user } = await authenticated();
    bookingAccess.hasUpcomingConfirmedBookings.mockResolvedValueOnce(true);
    await post('/users/me/deactivate')
      .set('Cookie', cookies)
      .send({ confirmation: true })
      .expect(409);
    bookingAccess.hasUpcomingConfirmedBookings.mockRejectedValueOnce(
      new ServiceUnavailableException(),
    );
    await post('/users/me/deactivate')
      .set('Cookie', cookies)
      .send({ confirmation: true })
      .expect(503);
    await post('/users/me/deactivate')
      .set('Cookie', cookies)
      .send({ confirmation: false })
      .expect(400);
    await post('/users/me/deactivate')
      .set('Cookie', cookies)
      .send({ confirmation: true })
      .expect(200);
    await get('/auth/me').set('Cookie', cookies).expect(401);
    expect((await login(user.email)).status).toBe(401);
  });
  it('validates actual provider before creating moderator and requires first-login password change', async () => {
    const { cookies } = await authenticated(UserRole.ADMIN);
    const body = {
      name: 'Moderator',
      email: 'mod@example.com',
      password,
      role: 'HOTEL_MODERATOR',
      providerId: new Types.ObjectId().toString(),
    };
    providers.verifyProvider.mockResolvedValueOnce(false);
    await post('/admin/moderators').set('Cookie', cookies).send(body).expect(400);
    await post('/admin/moderators')
      .set('Cookie', cookies)
      .send({ ...body, providerId: 'invalid' })
      .expect(400);
    await post('/admin/moderators')
      .set('Cookie', cookies)
      .send({ ...body, role: 'ADMIN' })
      .expect(400);
    const created = await post('/admin/moderators').set('Cookie', cookies).send(body).expect(201);
    expect(created.body.providerType).toBe('HOTEL');
    expect((await login(body.email)).body.user.mustChangePassword).toBe(true);
  });
  it('suspends/reactivates users, revokes access and records audit and pending notification', async () => {
    const admin = await authenticated(UserRole.ADMIN);
    const user = await authenticated();
    await patch(`/admin/users/${user.user.id}/suspend`).set('Cookie', admin.cookies).expect(200);
    await get('/auth/me').set('Cookie', user.cookies).expect(401);
    expect((await login(user.user.email)).body.message).toBe('Account suspended');
    await patch(`/admin/users/${user.user.id}/suspend`).set('Cookie', admin.cookies).expect(409);
    await patch(`/admin/users/${user.user.id}/reactivate`).set('Cookie', admin.cookies).expect(200);
    expect((await login(user.user.email)).status).toBe(200);
    await patch(`/admin/users/${admin.user.id}/suspend`).set('Cookie', admin.cookies).expect(409);
    expect(await app.get<Model<AuditLog>>(getModelToken(AuditLog.name)).countDocuments()).toBe(2);
    expect(
      await app
        .get<Model<NotificationOutbox>>(getModelToken(NotificationOutbox.name))
        .countDocuments({ deliveryStatus: 'PENDING' }),
    ).toBe(2);
  });
  it('suspends/reactivates moderators separately', async () => {
    const admin = await authenticated(UserRole.ADMIN);
    const mod = await authenticated(UserRole.AIRLINE_MODERATOR, {
      providerType: 'AIRLINE',
      providerId: new Types.ObjectId(),
    });
    await patch(`/admin/moderators/${mod.user.id}/suspend`)
      .set('Cookie', admin.cookies)
      .expect(200);
    await get('/auth/me').set('Cookie', mod.cookies).expect(401);
    await patch(`/admin/moderators/${mod.user.id}/reactivate`)
      .set('Cookie', admin.cookies)
      .expect(200);
    expect((await login(mod.user.email)).status).toBe(200);
  });
  it('rolls back state and revocation if required audit persistence fails', async () => {
    const admin = await authenticated(UserRole.ADMIN);
    const user = await authenticated();
    const audit = jest
      .spyOn(app.get(AuditService), 'record')
      .mockRejectedValueOnce(new Error('simulated persistence failure'));
    try {
      await patch(`/admin/users/${user.user.id}/suspend`).set('Cookie', admin.cookies).expect(500);
    } finally {
      audit.mockRestore();
    }
    expect((await users.findById(user.user.id))!.status).toBe(AccountStatus.ACTIVE);
    await get('/auth/me').set('Cookie', user.cookies).expect(200);
  });
  it('lists/filter accounts with stable ten-row pagination and safe projections', async () => {
    const { cookies } = await authenticated(UserRole.ADMIN);
    await Promise.all(
      Array.from({ length: 12 }, (_, i) => account(UserRole.USER, { name: `Traveler ${i}` })),
    );
    const first = await get('/admin/users?role=USER&status=ACTIVE&search=Traveler&page=1')
      .set('Cookie', cookies)
      .expect(200);
    expect(first.body.items).toHaveLength(10);
    expect(first.body.total).toBe(12);
    expect(first.body.pageCount).toBe(2);
    expect(
      (await get('/admin/users?role=USER&page=2').set('Cookie', cookies)).body.items,
    ).toHaveLength(2);
    expect(JSON.stringify(first.body)).not.toMatch(/password|authVersion|session|lockedUntil/);
    await get('/admin/users?page=-1').set('Cookie', cookies).expect(400);
    await get('/admin/users?role[$ne]=ADMIN').set('Cookie', cookies).expect(400);
  });
  it('forwards validated booking filters; rejects invalid dates and unavailable integration', async () => {
    const { cookies } = await authenticated(UserRole.ADMIN);
    await get(
      '/admin/bookings?type=FLIGHT&status=CONFIRMED&page=2&startDate=2026-01-01&endDate=2026-12-31',
    )
      .set('Cookie', cookies)
      .expect(200);
    expect(bookingReader.findBookings).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'FLIGHT', status: 'CONFIRMED', page: 2 }),
    );
    await get('/admin/bookings?startDate=2026-12-31&endDate=2026-01-01')
      .set('Cookie', cookies)
      .expect(400);
    await get('/admin/bookings?startDate=2026-01-01T12:00:00').set('Cookie', cookies).expect(400);
    bookingReader.findBookings.mockRejectedValueOnce(new ServiceUnavailableException());
    await get('/admin/bookings').set('Cookie', cookies).expect(503);
  });
  it('records successful provider changes and never reports success when actual update fails', async () => {
    const { cookies } = await authenticated(UserRole.ADMIN);
    const id = new Types.ObjectId().toString();
    await patch(`/admin/providers/hotels/${id}/deactivate`).set('Cookie', cookies).expect(200);
    expect(providers.setProviderActive).toHaveBeenCalledWith('HOTEL', id, false, expect.anything());
    providers.setProviderActive.mockRejectedValueOnce(new ServiceUnavailableException());
    await patch(`/admin/providers/airlines/${id}/reactivate`).set('Cookie', cookies).expect(503);
    expect(await app.get<Model<AuditLog>>(getModelToken(AuditLog.name)).countDocuments()).toBe(1);
  });
  it('rejects missing and foreign CSRF origins, even on login', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'x@example.com', password })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .set('X-Triplify-CSRF', '1')
      .send({ email: 'x@example.com', password })
      .expect(403);
  });
  it('rate-limits login attempts per IP after 20 requests', async () => {
    for (let i = 0; i < 20; i++)
      await post('/auth/login').send({ email: 'invalid', password }).expect(400);
    await post('/auth/login').send({ email: 'invalid', password }).expect(429);
  });
  it('handles malformed ObjectIds without leaking server details', async () => {
    const { cookies } = await authenticated(UserRole.ADMIN);
    await patch('/admin/users/not-an-id/suspend').set('Cookie', cookies).expect(400);
  });
  it('uses current database role/provider assignment and blocks moderator admin access', async () => {
    const mod = await authenticated(UserRole.HOTEL_MODERATOR, {
      providerType: 'HOTEL',
      providerId: new Types.ObjectId(),
    });
    await get('/admin/users').set('Cookie', mod.cookies).expect(403);
    await patch(`/admin/providers/airlines/${new Types.ObjectId()}/deactivate`)
      .set('Cookie', mod.cookies)
      .expect(403);
    const admin = await authenticated(UserRole.ADMIN);
    await users.updateOne({ _id: admin.user._id }, { $set: { role: UserRole.USER } });
    await get('/admin/users').set('Cookie', admin.cookies).expect(403);
  });
  it('rejects null profile values and provider assignment injection', async () => {
    const { cookies } = await authenticated();
    await patch('/users/me').set('Cookie', cookies).send({ name: null }).expect(400);
    await patch('/users/me').set('Cookie', cookies).send({ preferredCurrency: null }).expect(400);
    await patch('/users/me')
      .set('Cookie', cookies)
      .send({ providerId: new Types.ObjectId().toString() })
      .expect(400);
  });
  it('serves non-sensitive health, public reference data and OpenAPI', async () => {
    expect((await get('/health')).body).toEqual({ status: 'ok' });
    expect((await get('/reference/currencies')).body.items[0].code).toBe('USD');
    await get('/docs-json').expect(200);
  });
  it('seeds admin idempotently without password replacement or promotion', async () => {
    const credentials = {
      email: 'seed@example.com',
      name: 'Seed Admin',
      password: 'SeedPassword123',
    };
    expect((await seedAdmin(users, credentials)).created).toBe(true);
    const before = await users.findOne({ email: credentials.email }).select('+passwordHash');
    expect(
      (await seedAdmin(users, { ...credentials, password: 'DifferentPassword123' })).created,
    ).toBe(false);
    expect((await users.findById(before!._id).select('+passwordHash'))!.passwordHash).toBe(
      before!.passwordHash,
    );
    const ordinary = await account();
    await expect(seedAdmin(users, { ...credentials, email: ordinary.email })).rejects.toThrow(
      'refusing promotion',
    );
  });
  it('seeds reference data idempotently with correct city relationships', async () => {
    const models = {
      countries: app.get<Model<Country>>(getModelToken(Country.name)),
      cities: app.get<Model<City>>(getModelToken(City.name)),
      airports: app.get<Model<Airport>>(getModelToken(Airport.name)),
      currencies: app.get<Model<Currency>>(getModelToken(Currency.name)),
    };
    await seedReference(models);
    await seedReference(models);
    expect(await models.airports.countDocuments()).toBe(7);
    expect(await models.cities.countDocuments()).toBe(7);
    expect(await models.countries.countDocuments()).toBe(7);
    expect(await models.currencies.countDocuments()).toBe(2);
    const airport = await models.airports.findOne({ iataCode: 'CAI' });
    expect(airport!.city).toBe('cairo');
    for (const entry of await models.airports.find())
      expect(
        await models.cities.exists({
          code: entry.city,
          country: entry.country,
          timeZone: entry.timeZone,
        }),
      ).toBeTruthy();
  });
});
