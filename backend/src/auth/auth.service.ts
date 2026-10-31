import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { AccountStatus, CLOCK, Clock, Principal, UserRole } from '../common/domain';
import { CredentialsDto, RegisterDto } from '../common/dto';
import { User, UserDocument, publicUser } from '../users/user.schema';
import { Session } from './session.schema';
export const IDLE_MS = 30 * 60 * 1000;
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const invalid = () => new UnauthorizedException('Invalid email or password');
export const authRequired = () =>
  new UnauthorizedException({
    code: 'AUTHENTICATION_REQUIRED',
    message: 'Authentication required',
  });
const privateFields = '+passwordHash +failedLoginAttempts +lockedUntil +authVersion +loginRevision';
@Injectable()
export class AuthService {
  private readonly dummyHash = hash(randomBytes(32).toString('hex'), 12);
  constructor(
    @InjectModel(User.name) private users: Model<User>,
    @InjectModel(Session.name) private sessions: Model<Session>,
    private jwt: JwtService,
    @Inject(CLOCK) private clock: Clock,
  ) {}
  async register(dto: RegisterDto) {
    const user = await this.users.create({
      name: dto.name,
      email: dto.email,
      passwordHash: await hash(dto.password, 12),
      termsAcceptedAt: this.clock.now(),
      role: UserRole.USER,
    });
    return publicUser(user);
  }
  private status(user: UserDocument) {
    if (user.status === AccountStatus.SUSPENDED) throw new ForbiddenException('Account suspended');
    if (user.status !== AccountStatus.ACTIVE) throw invalid();
  }
  async login(dto: CredentialsDto) {
    // Compare-and-swap serializes failed/successful attempts and password/status changes.
    for (let attempt = 0; attempt < 30; attempt++) {
      const user = await this.users.findOne({ email: dto.email }).select(privateFields);
      if (!user) {
        await compare(dto.password, await this.dummyHash);
        throw invalid();
      }
      const now = this.clock.now();
      if (user.lockedUntil && user.lockedUntil > now)
        throw new HttpException(
          {
            code: 'ACCOUNT_LOCKED',
            message: 'Account locked for 15 minutes',
            lockedUntil: user.lockedUntil,
          },
          429,
        );
      const correct = await compare(dto.password, user.passwordHash);
      const predicate = {
        _id: user._id,
        loginRevision: user.loginRevision,
        authVersion: user.authVersion,
        status: user.status,
      };
      if (!correct) {
        const failures = user.lockedUntil ? 1 : user.failedLoginAttempts + 1;
        const updated = await this.users.updateOne(predicate, {
          $set: {
            failedLoginAttempts: failures,
            lockedUntil: failures >= 5 ? new Date(now.getTime() + 15 * 60 * 1000) : null,
          },
          $inc: { loginRevision: 1 },
        });
        if (!updated.modifiedCount) continue;
        if (failures >= 5)
          throw new HttpException(
            { code: 'ACCOUNT_LOCKED', message: 'Account locked for 15 minutes' },
            429,
          );
        throw invalid();
      }
      this.status(user);
      const updated = await this.users.updateOne(predicate, {
        $set: { failedLoginAttempts: 0, lastLoginAt: now },
        $unset: { lockedUntil: 1 },
        $inc: { loginRevision: 1 },
      });
      if (!updated.modifiedCount) continue;
      const sessionId = new Types.ObjectId();
      const refresh = `${sessionId}.${randomBytes(32).toString('base64url')}`;
      await this.sessions.create({
        _id: sessionId,
        userId: user._id,
        refreshHash: digest(refresh),
        authVersion: user.authVersion,
        lastActivityAt: now,
        expiresAt: new Date(now.getTime() + REFRESH_MS),
      });
      return {
        user: publicUser(user),
        routeHint: user.mustChangePassword
          ? '/change-password'
          : {
              USER: '/dashboard',
              ADMIN: '/admin',
              HOTEL_MODERATOR: '/hotel-moderator',
              AIRLINE_MODERATOR: '/airline-moderator',
            }[user.role],
        ...(await this.tokens(user.id, sessionId.toString(), refresh)),
      };
    }
    throw new ConflictException('Concurrent login attempts; retry');
  }
  private async tokens(userId: string, sessionId: string, refresh: string) {
    return {
      access: await this.jwt.signAsync({ sub: userId, sid: sessionId }, { expiresIn: '10m' }),
      refresh,
    };
  }
  private live(now: Date) {
    return {
      revokedAt: { $exists: false },
      expiresAt: { $gt: now },
      lastActivityAt: { $gt: new Date(now.getTime() - IDLE_MS) },
    };
  }
  async authenticate(token?: string): Promise<Principal> {
    if (!token) throw authRequired();
    let payload: { sub: string; sid: string };
    try {
      payload = await this.jwt.verifyAsync(token, { algorithms: ['HS256'] });
    } catch {
      throw authRequired();
    }
    if (!/^[a-f\d]{24}$/i.test(payload.sub ?? '') || !/^[a-f\d]{24}$/i.test(payload.sid ?? ''))
      throw authRequired();
    const now = this.clock.now();
    const user = await this.users.findById(payload.sub).select('+authVersion');
    if (!user || user.status !== AccountStatus.ACTIVE) throw authRequired();
    const session = await this.sessions.findOneAndUpdate(
      { _id: payload.sid, userId: user._id, authVersion: user.authVersion, ...this.live(now) },
      { $max: { lastActivityAt: now } },
    );
    if (!session) throw authRequired();
    return {
      id: user.id as string,
      name: user.name,
      role: user.role,
      status: user.status,
      providerId: user.providerId?.toString(),
      providerType: user.providerType,
      mustChangePassword: user.mustChangePassword,
      authVersion: user.authVersion,
      sessionId: payload.sid,
    };
  }
  async refresh(raw?: string) {
    if (!raw || !/^[a-f\d]{24}\.[A-Za-z0-9_-]{43}$/i.test(raw)) throw authRequired();
    const sid = raw.split('.')[0];
    const now = this.clock.now();
    const session = await this.sessions
      .findOne({ _id: sid, ...this.live(now) })
      .select('+refreshHash');
    if (!session) throw authRequired();
    const expected = Buffer.from(session.refreshHash, 'hex');
    if (!timingSafeEqual(expected, Buffer.from(digest(raw), 'hex'))) {
      await this.sessions.updateOne({ _id: sid }, { $set: { revokedAt: now } });
      throw authRequired();
    }
    const user = await this.users.findById(session.userId).select('+authVersion');
    if (!user || user.status !== AccountStatus.ACTIVE || user.authVersion !== session.authVersion)
      throw authRequired();
    const refresh = `${sid}.${randomBytes(32).toString('base64url')}`;
    const rotated = await this.sessions.updateOne(
      { _id: sid, refreshHash: digest(raw), ...this.live(now) },
      { $set: { refreshHash: digest(refresh) }, $max: { lastActivityAt: now } },
    );
    if (!rotated.modifiedCount) {
      await this.sessions.updateOne({ _id: sid }, { $set: { revokedAt: now } });
      throw authRequired();
    }
    return this.tokens(user.id as string, sid, refresh);
  }
  async logout(actor: Principal) {
    await this.sessions.updateOne(
      { _id: actor.sessionId, userId: actor.id },
      { $set: { revokedAt: this.clock.now() } },
    );
  }
}
