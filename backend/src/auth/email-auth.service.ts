import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { createHash, randomBytes } from 'crypto';
import { hash } from 'bcryptjs';
import { User } from '../users/user.schema';
import { AccountStatus } from '../common/domain';
import { MailService } from '../mail/mail.service';
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
@Injectable()
export class EmailAuthService {
  constructor(
    @InjectModel(User.name) private users: Model<User>,
    @InjectConnection() private connection: Connection,
    private mail: MailService,
    private config: ConfigService,
  ) {}
  async request(email: string, purpose: 'verify' | 'reset') {
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (purpose === 'verify' ? 86400000 : 1800000));
    const prefix = purpose === 'verify' ? 'verification' : 'recovery';
    await this.connection.transaction(async (session) => {
      const user = await this.users.findOneAndUpdate(
        {
          email,
          status: AccountStatus.ACTIVE,
          ...(purpose === 'verify' ? { emailVerifiedAt: { $exists: false } } : {}),
          $or: [
            { [`${prefix}RequestedAt`]: { $exists: false } },
            { [`${prefix}RequestedAt`]: { $lte: new Date(now.getTime() - 60000) } },
          ],
        },
        {
          $set: {
            [`${prefix}Hash`]: digest(token),
            [`${prefix}ExpiresAt`]: expiresAt,
            [`${prefix}RequestedAt`]: now,
          },
        },
        { new: true, session },
      );
      if (!user) return;
      const origin = this.config.getOrThrow<string>('FRONTEND_URL').split(',')[0];
      const link = `${origin}/${purpose === 'verify' ? 'verify-email' : 'reset-password'}#token=${token}`;
      await this.mail.enqueue(
        `${purpose}:${digest(token)}`,
        {
          to: user.email,
          subject:
            purpose === 'verify' ? 'Verify your Triplify email' : 'Reset your Triplify password',
          text: `Open this link to ${purpose === 'verify' ? 'verify your email' : 'reset your password'}: ${link}\nExpires at ${expiresAt.toISOString()}. If you did not request this, ignore this message.`,
        },
        expiresAt,
        session,
      );
    });
    return { success: true, message: 'If the account is eligible, an email will be sent.' };
  }
  async verify(token: string) {
    const result = await this.users.updateOne(
      {
        verificationHash: digest(token),
        verificationExpiresAt: { $gt: new Date() },
        status: AccountStatus.ACTIVE,
      },
      {
        $set: { emailVerifiedAt: new Date() },
        $unset: { verificationHash: 1, verificationExpiresAt: 1 },
      },
    );
    if (!result.modifiedCount) throw new BadRequestException('Invalid or expired token');
    return { success: true };
  }
  async reset(token: string, password: string) {
    const passwordHash = await hash(password, 12);
    const result = await this.users.updateOne(
      {
        recoveryHash: digest(token),
        recoveryExpiresAt: { $gt: new Date() },
        status: AccountStatus.ACTIVE,
      },
      {
        $set: { passwordHash, mustChangePassword: false, failedLoginAttempts: 0 },
        $inc: { authVersion: 1, loginRevision: 1 },
        $unset: { recoveryHash: 1, recoveryExpiresAt: 1, lockedUntil: 1 },
      },
    );
    if (!result.modifiedCount) throw new BadRequestException('Invalid or expired token');
    return { success: true, reauthenticate: true };
  }
  async preference(userId: string, enabled: boolean) {
    await this.users.updateOne({ _id: userId }, { $set: { emailNotifications: enabled } });
    return { success: true, enabled };
  }
}
