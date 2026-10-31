import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { hash } from 'bcryptjs';
import { randomBytes } from 'crypto';
import { AccountStatus, CLOCK, Clock, Principal, ProviderType, UserRole } from '../common/domain';
import { AccountFilters, BookingFilters, ModeratorDto } from '../common/dto';
import { Session } from '../auth/session.schema';
import { User, publicUser } from '../users/user.schema';
import { AuditService } from '../audit/audit.service';
import {
  BOOKING_READER,
  AdminBookingReaderPort,
  PROVIDER_MANAGEMENT,
  ProviderManagementPort,
} from '../integrations/contracts';
import { escapeRegex } from '../reference-data/reference.controller';
@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private users: Model<User>,
    @InjectModel(Session.name) private sessions: Model<Session>,
    @InjectConnection() private db: Connection,
    private audit: AuditService,
    @Inject(PROVIDER_MANAGEMENT) private providers: ProviderManagementPort,
    @Inject(BOOKING_READER) private bookings: AdminBookingReaderPort,
    @Inject(CLOCK) private clock: Clock,
  ) {}
  async list(filters: AccountFilters) {
    const query: Record<string, unknown> = {};
    if (filters.role) query.role = filters.role;
    if (filters.status) query.status = filters.status;
    if (filters.search)
      query.$or = ['name', 'email'].map((key) => ({
        [key]: { $regex: escapeRegex(filters.search!), $options: 'i' },
      }));
    const [items, total] = await Promise.all([
      this.users
        .find(query)
        .select('name email role status createdAt')
        .sort({ createdAt: -1, _id: -1 })
        .skip((filters.page - 1) * 10)
        .limit(10),
      this.users.countDocuments(query),
    ]);
    return {
      items: items.map((user) => ({
        id: user.id as string,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
      })),
      total,
      page: filters.page,
      pageCount: Math.ceil(total / 10),
    };
  }
  async moderator(actor: Principal, dto: ModeratorDto) {
    const type: ProviderType = dto.role === UserRole.HOTEL_MODERATOR ? 'HOTEL' : 'AIRLINE';
    const passwordHash = await hash(dto.password, 12);
    return this.db.transaction(async (transaction) => {
      if (!(await this.providers.verifyProvider(type, dto.providerId, transaction)))
        throw new BadRequestException('Provider does not exist or has wrong type');
      const [user] = await this.users.create(
        [
          {
            name: dto.name,
            email: dto.email,
            role: dto.role,
            providerId: dto.providerId,
            providerType: type,
            passwordHash,
            mustChangePassword: true,
          },
        ],
        { session: transaction },
      );
      await this.audit.record(
        actor.id,
        'MODERATOR_CREATED',
        user.id as string,
        'USER',
        transaction,
        undefined,
        AccountStatus.ACTIVE,
        false,
      );
      return publicUser(user);
    });
  }
  async status(actor: Principal, id: string, active: boolean, moderator: boolean) {
    const roles = moderator
      ? [UserRole.HOTEL_MODERATOR, UserRole.AIRLINE_MODERATOR]
      : [UserRole.USER];
    const before = active ? AccountStatus.SUSPENDED : AccountStatus.ACTIVE;
    const after = active ? AccountStatus.ACTIVE : AccountStatus.SUSPENDED;
    return this.db.transaction(async (transaction) => {
      const user = await this.users.findOneAndUpdate(
        { _id: id, role: { $in: roles }, status: before },
        { $set: { status: after }, $inc: { authVersion: 1, loginRevision: 1 } },
        { session: transaction, new: true },
      );
      if (!user) throw new ConflictException('Invalid account or status transition');
      await this.sessions.updateMany(
        { userId: id },
        { $set: { revokedAt: this.clock.now() } },
        { session: transaction },
      );
      await this.audit.record(
        actor.id,
        active ? 'ACCOUNT_REACTIVATED' : 'ACCOUNT_SUSPENDED',
        id,
        'USER',
        transaction,
        before,
        after,
      );
      return { user: publicUser(user), notificationStatus: 'PENDING_INTEGRATION' };
    });
  }
  async reset(actor: Principal, id: string) {
    const temporaryPassword = `T9!${randomBytes(18).toString('base64url')}`;
    const passwordHash = await hash(temporaryPassword, 12);
    await this.db.transaction(async (transaction) => {
      const user = await this.users.findOneAndUpdate(
        { _id: id, role: { $ne: UserRole.ADMIN }, status: { $ne: AccountStatus.DEACTIVATED } },
        {
          $set: { passwordHash, mustChangePassword: true, failedLoginAttempts: 0 },
          $unset: { lockedUntil: 1 },
          $inc: { authVersion: 1, loginRevision: 1 },
        },
        { session: transaction },
      );
      if (!user) throw new NotFoundException('Eligible account not found');
      await this.sessions.updateMany(
        { userId: id },
        { $set: { revokedAt: this.clock.now() } },
        { session: transaction },
      );
      await this.audit.record(
        actor.id,
        'PASSWORD_RESET',
        id,
        'USER',
        transaction,
        undefined,
        undefined,
        false,
      );
    });
    return { temporaryPassword, mustChangePassword: true };
  }
  async provider(actor: Principal, type: ProviderType, id: string, active: boolean) {
    await this.db.transaction(async (transaction) => {
      await this.providers.setProviderActive(type, id, active, transaction);
      await this.audit.record(
        actor.id,
        active ? 'PROVIDER_REACTIVATED' : 'PROVIDER_DEACTIVATED',
        id,
        type,
        transaction,
        active ? 'INACTIVE' : 'ACTIVE',
        active ? 'ACTIVE' : 'INACTIVE',
      );
    });
    return { success: true, notificationStatus: 'PENDING_INTEGRATION' };
  }
  findBookings(filters: BookingFilters) {
    if (
      filters.startDate &&
      filters.endDate &&
      new Date(filters.startDate) > new Date(filters.endDate)
    )
      throw new BadRequestException('startDate must precede endDate');
    return this.bookings.findBookings(filters);
  }
}
