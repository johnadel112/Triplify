import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { compare, hash } from 'bcryptjs';
import { AccountStatus, CLOCK, Clock, Principal } from '../common/domain';
import { PasswordDto, ProfileDto } from '../common/dto';
import { BOOKING_ACCESS, BookingAccessPort } from '../integrations/contracts';
import { Session } from '../auth/session.schema';
import { Currency } from '../reference-data/reference.schema';
import { User, publicUser } from './user.schema';
@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private users: Model<User>,
    @InjectModel(Session.name) private sessions: Model<Session>,
    @InjectModel(Currency.name) private currencies: Model<Currency>,
    @InjectConnection() private db: Connection,
    @Inject(BOOKING_ACCESS) private bookings: BookingAccessPort,
    @Inject(CLOCK) private clock: Clock,
  ) {}
  async me(actor: Principal) {
    const user = await this.users.findById(actor.id);
    if (!user) throw new UnauthorizedException();
    return publicUser(user);
  }
  async update(actor: Principal, dto: ProfileDto) {
    if (dto.preferredCurrency && !(await this.currencies.exists({ code: dto.preferredCurrency })))
      throw new BadRequestException('Unsupported currency');
    const user = await this.users.findOneAndUpdate(
      { _id: actor.id, status: AccountStatus.ACTIVE, authVersion: actor.authVersion },
      { $set: dto },
      { new: true, runValidators: true },
    );
    if (!user) throw new ConflictException('Account changed; authenticate again');
    return publicUser(user);
  }
  async password(actor: Principal, dto: PasswordDto) {
    const user = await this.users.findById(actor.id).select('+passwordHash +authVersion');
    if (!user || !(await compare(dto.currentPassword, user.passwordHash)))
      throw new BadRequestException('Incorrect current password');
    if (await compare(dto.newPassword, user.passwordHash))
      throw new BadRequestException('New password must differ from current password');
    const passwordHash = await hash(dto.newPassword, 12);
    await this.db.transaction(async (transaction) => {
      const changed = await this.users.updateOne(
        { _id: actor.id, authVersion: actor.authVersion, status: AccountStatus.ACTIVE },
        {
          $set: { passwordHash, mustChangePassword: false, failedLoginAttempts: 0 },
          $unset: { lockedUntil: 1 },
          $inc: { authVersion: 1, loginRevision: 1 },
        },
        { session: transaction },
      );
      if (!changed.modifiedCount)
        throw new ConflictException('Account changed; authenticate again');
      await this.sessions.updateMany(
        { userId: actor.id, revokedAt: { $exists: false } },
        { $set: { revokedAt: this.clock.now() } },
        { session: transaction },
      );
    });
    return { success: true, reauthenticate: true };
  }
  async deactivate(actor: Principal) {
    await this.db.transaction(async (transaction) => {
      if (await this.bookings.hasUpcomingConfirmedBookings(actor.id, this.clock.now(), transaction))
        throw new ConflictException('Upcoming Confirmed bookings prevent deactivation');
      const changed = await this.users.updateOne(
        { _id: actor.id, status: AccountStatus.ACTIVE, authVersion: actor.authVersion },
        {
          $set: { status: AccountStatus.DEACTIVATED, deactivatedAt: this.clock.now() },
          $inc: { authVersion: 1, loginRevision: 1 },
        },
        { session: transaction },
      );
      if (!changed.modifiedCount) throw new ConflictException('Account changed');
      await this.sessions.updateMany(
        { userId: actor.id },
        { $set: { revokedAt: this.clock.now() } },
        { session: transaction },
      );
    });
    return { success: true };
  }
}
