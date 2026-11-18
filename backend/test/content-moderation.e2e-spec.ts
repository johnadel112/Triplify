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
import { PROVIDER_MANAGEMENT } from '../src/integrations/contracts';
import { configureApp } from '../src/bootstrap';
import { BlogPost, BlogPostStatus } from '../src/blog/blog-post.schema';
import { BlogComment, PostLike } from '../src/blog/blog.schema';
import { Review } from '../src/hotel-bookings/review.schema';
import { Itinerary } from '../src/itineraries/itineraries.schema';
import { Report } from '../src/reports/reports.schema';

/** GEN-09/GEN-10: reports lead to real hidden/deleted content on the public endpoints. */
describe('Content moderation through reports (GEN-09, GEN-10)', () => {
  let mongo: MongoMemoryReplSet;
  let app: INestApplication;
  let users: Model<User>;
  let posts: Model<BlogPost>;
  let comments: Model<BlogComment>;
  let likes: Model<PostLike>;
  let reviews: Model<Review>;
  let itineraries: Model<Itinerary>;
  let reports: Model<Report>;
  let passwordHash: string;
  const password = 'Secure12345';

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  const csrf = (t: request.Test) =>
    t.set('Origin', 'http://localhost:5173').set('X-Triplify-CSRF', '1');
  const post = (path: string, cookies: string[] = []) =>
    csrf(request(server()).post(`/api${path}`)).set('Cookie', cookies);
  const patch = (path: string, cookies: string[] = []) =>
    csrf(request(server()).patch(`/api${path}`)).set('Cookie', cookies);
  const del = (path: string, cookies: string[] = []) =>
    csrf(request(server()).delete(`/api${path}`)).set('Cookie', cookies);
  const get = (path: string, cookies: string[] = []) =>
    request(server()).get(`/api${path}`).set('Cookie', cookies);

  async function account(role = UserRole.USER) {
    const user = await users.create({
      name: `Person ${new Types.ObjectId().toString().slice(-4)}`,
      email: `${new Types.ObjectId().toString()}@example.com`,
      passwordHash,
      role,
    });
    const response = await post('/auth/login').send({ email: user.email, password });
    expect(response.status).toBe(200);
    const cookies = (response.headers['set-cookie'] as unknown as string[]).map(
      (v) => v.split(';')[0],
    );
    return { user, cookies };
  }

  const publishedPost = (authorId: Types.ObjectId) =>
    posts.create({
      authorId,
      title: 'Spam post',
      body: 'Buy now',
      status: BlogPostStatus.PUBLISHED,
      publishedAt: new Date(),
    });
  const publicItinerary = (userId: Types.ObjectId) =>
    itineraries.create({
      userId,
      title: 'Cairo weekend',
      countries: ['EG'],
      startDate: '2027-01-10',
      isPublic: true,
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
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PROVIDER_MANAGEMENT)
      .useValue({ verifyProvider: jest.fn(), setProviderActive: jest.fn() })
      .compile();
    app = moduleRef.createNestApplication();
    app.useLogger(false);
    configureApp(app);
    await app.init();
    users = app.get(getModelToken(User.name));
    posts = app.get(getModelToken(BlogPost.name));
    comments = app.get(getModelToken(BlogComment.name));
    likes = app.get(getModelToken(PostLike.name));
    reviews = app.get(getModelToken(Review.name));
    itineraries = app.get(getModelToken(Itinerary.name));
    reports = app.get(getModelToken(Report.name));
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

  it('hiding a reported post removes it from public pages and settles all its reports', async () => {
    const author = await account();
    const reporterA = await account();
    const reporterB = await account();
    const admin = await account(UserRole.ADMIN);
    const spam = await publishedPost(author.user._id);
    const target = { targetType: 'POST', targetId: spam.id as string, reason: 'Spam content' };

    await get(`/blog/posts/${spam.id as string}`).expect(200);
    const first = await post('/reports', reporterA.cookies).send(target).expect(201);
    await post('/reports', reporterB.cookies).send(target).expect(201);
    await post('/reports', reporterA.cookies).send(target).expect(409);

    await patch(`/admin/reports/${first.body._id ?? first.body.id}`, admin.cookies)
      .send({ action: 'HIDE' })
      .expect(200);

    await get(`/blog/posts/${spam.id as string}`).expect(404);
    expect((await get('/blog/posts').expect(200)).body.total).toBe(0);
    expect((await get(`/blog/authors/${author.user.id as string}`).expect(200)).body).toMatchObject(
      {
        posts: { total: 0 },
      },
    );
    expect(await reports.countDocuments({ status: 'RESOLVED_HIDDEN' })).toBe(2);
    await patch(`/admin/reports/${first.body._id ?? first.body.id}`, admin.cookies)
      .send({ action: 'DELETE' })
      .expect(409);
  });

  it('deleting a post through the admin endpoint also removes its comments and likes', async () => {
    const author = await account();
    const admin = await account(UserRole.ADMIN);
    const spam = await publishedPost(author.user._id);
    await comments.create({ postId: spam._id, userId: author.user._id, content: 'hi' });
    await likes.create({ postId: spam._id, userId: author.user._id });

    await del(`/admin/content/POST/${spam.id as string}`, admin.cookies).expect(200);

    expect(await posts.exists({ _id: spam._id })).toBeNull();
    expect(await comments.countDocuments({ postId: spam._id })).toBe(0);
    expect(await likes.countDocuments({ postId: spam._id })).toBe(0);
    await del(`/admin/content/POST/${spam.id as string}`, admin.cookies).expect(404);
  });

  it('hiding a review removes it from hotel reviews and the average rating', async () => {
    const reviewer = await account();
    const admin = await account(UserRole.ADMIN);
    const hotelId = new Types.ObjectId();
    const bad = await reviews.create({
      bookingId: new Types.ObjectId(),
      hotelId,
      userId: reviewer.user._id,
      rating: 1,
      text: 'Abusive text',
    });
    await reviews.create({
      bookingId: new Types.ObjectId(),
      hotelId,
      userId: reviewer.user._id,
      rating: 5,
    });
    expect((await get(`/hotels/${hotelId.toString()}/reviews`).expect(200)).body).toMatchObject({
      ratingCount: 2,
      averageRating: 3,
    });

    const report = await post('/reports', reviewer.cookies)
      .send({ targetType: 'REVIEW', targetId: bad.id as string, reason: 'Abusive language' })
      .expect(201);
    await patch(`/admin/reports/${report.body._id ?? report.body.id}`, admin.cookies)
      .send({ action: 'HIDE' })
      .expect(200);

    expect((await get(`/hotels/${hotelId.toString()}/reviews`).expect(200)).body).toMatchObject({
      ratingCount: 1,
      averageRating: 5,
    });
  });

  it('a hidden itinerary leaves public search and cannot be cloned, but its owner keeps it', async () => {
    const owner = await account();
    const other = await account();
    const admin = await account(UserRole.ADMIN);
    const trip = await publicItinerary(owner.user._id);
    expect((await get('/itineraries/public/search').expect(200)).body.items).toHaveLength(1);

    await del(`/admin/content/ITINERARY/${trip.id as string}`, admin.cookies).expect(200);
    // DELETE removes it entirely; a second itinerary is used for hiding.
    expect(await itineraries.exists({ _id: trip._id })).toBeNull();

    const hiddenTrip = await publicItinerary(owner.user._id);
    const report = await post('/reports', other.cookies)
      .send({ targetType: 'ITINERARY', targetId: hiddenTrip.id as string, reason: 'Misleading' })
      .expect(201);
    await patch(`/admin/reports/${report.body._id ?? report.body.id}`, admin.cookies)
      .send({ action: 'HIDE' })
      .expect(200);

    expect((await get('/itineraries/public/search').expect(200)).body.items).toHaveLength(0);
    await get(`/itineraries/public/${hiddenTrip.id as string}`).expect(404);
    await post(`/itineraries/${hiddenTrip.id as string}/clone`, other.cookies)
      .send({})
      .expect(403);
    await get(`/itineraries/${hiddenTrip.id as string}`, owner.cookies).expect(200);
  });

  it('rejects unknown content types, invalid ids and missing content', async () => {
    const admin = await account(UserRole.ADMIN);
    const user = await account();
    await del(`/admin/content/VIDEO/${new Types.ObjectId().toString()}`, admin.cookies).expect(400);
    await del(`/admin/content/REVIEW/${new Types.ObjectId().toString()}`, admin.cookies).expect(
      404,
    );
    await post('/reports', user.cookies)
      .send({ targetType: 'POST', targetId: 'not-an-id', reason: 'Spam content' })
      .expect(400);
    await del(`/admin/content/POST/${new Types.ObjectId().toString()}`, user.cookies).expect(403);
  });
});
