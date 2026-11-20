import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClientSession, Model } from 'mongoose';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'crypto';
import nodemailer from 'nodemailer';
import { MailJob } from './mail.schema';
import { Notification } from '../notifications/notifications.schema';
import { User } from '../users/user.schema';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

@Injectable()
export class MailTransport {
  constructor(private config: ConfigService) {}
  async send(message: MailMessage, id: string): Promise<void> {
    // Disabled mode never contacts a server; tests replace this provider to inspect delivery.
    const mode = this.config.get('MAIL_MODE', 'disabled');
    if (mode === 'resend') {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.getOrThrow<string>('RESEND_API_KEY')}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `triplify-${id}`,
          },
          body: JSON.stringify({ ...message, from: this.config.getOrThrow<string>('MAIL_FROM') }),
          signal: AbortSignal.timeout(20000),
          redirect: 'error',
        });
        if (!response.ok) throw new Error('Delivery failed');
        const result = await response.json() as { id?: string };
        if (!result.id) throw new Error('Delivery failed');
        return;
      } catch {
        // Provider responses may contain addresses or credentials. Keep them out of logs.
        throw new Error('Email provider delivery failed');
      }
    }
    if (mode !== 'smtp') throw new Error('Email delivery disabled');
    const transport = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('SMTP_HOST'),
      port: Number(this.config.get('SMTP_PORT', 587)),
      secure: this.config.get('SMTP_SECURE') === 'true',
      requireTLS: true,
      auth: {
        user: this.config.getOrThrow<string>('SMTP_USER'),
        pass: this.config.getOrThrow<string>('SMTP_PASSWORD'),
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    const result = await transport.sendMail({
      ...message,
      from: this.config.getOrThrow<string>('MAIL_FROM'),
      messageId: `<${id}@triplify.local>`,
    });
    if (!result.accepted.length) throw new Error('Recipient not accepted');
  }
}

@Injectable()
export class MailService {
  constructor(
    @InjectModel(MailJob.name) private jobs: Model<MailJob>,
    @InjectModel(Notification.name) private notifications: Model<Notification>,
    @InjectModel(User.name) private users: Model<User>,
    private config: ConfigService,
    private transport: MailTransport,
  ) {}
  private key() {
    return createHash('sha256')
      .update(this.config.getOrThrow<string>('JWT_ACCESS_SECRET') + ':mail')
      .digest();
  }
  private encrypt(message: MailMessage) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(message), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
  }
  private decrypt(value: string): MailMessage {
    const data = Buffer.from(value, 'base64');
    const cipher = createDecipheriv('aes-256-gcm', this.key(), data.subarray(0, 12));
    cipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString(),
    ) as MailMessage;
  }
  async enqueue(
    key: string,
    message: MailMessage,
    expiresAt = new Date(Date.now() + 7 * 86400000),
    session?: ClientSession,
  ) {
    await this.jobs.updateOne(
      { key },
      { $setOnInsert: { key, payload: this.encrypt(message), expiresAt } },
      { upsert: true, session },
    );
  }
  @Cron(CronExpression.EVERY_MINUTE)
  async process() {
    if (!['smtp', 'resend'].includes(this.config.get('MAIL_MODE', 'disabled'))) return;
    // Notifications themselves are the durable source, including those written inside booking transactions.
    const pending = await this.notifications
      .find({ emailQueued: { $ne: true } })
      .sort({ createdAt: 1 })
      .limit(100);
    for (const notification of pending) {
      const user = await this.users.findById(notification.userId);
      if (user?.emailVerifiedAt && user.emailNotifications) {
        await this.enqueue(`notification:${notification._id}`, {
          to: user.email,
          subject: notification.title,
          text: notification.message,
        });
      }
      await this.notifications.updateOne(
        { _id: notification._id },
        { $set: { emailQueued: true } },
      );
    }
    for (let i = 0; i < 100; i++) {
      const now = new Date();
      const leaseId = randomUUID();
      const job = await this.jobs
        .findOneAndUpdate(
          {
            status: 'PENDING',
            nextAttemptAt: { $lte: now },
            expiresAt: { $gt: now },
            $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }],
          },
          {
            $set: { leaseId, leaseUntil: new Date(now.getTime() + 120000) },
            $inc: { attempts: 1 },
          },
          { new: true },
        )
        .select('+payload');
      if (!job) break;
      try {
        const message = this.decrypt(job.payload);
        if (job.key.startsWith('notification:')) {
          const source = await this.notifications.findById(job.key.slice('notification:'.length));
          const recipient = source && (await this.users.findById(source.userId));
          if (
            !recipient?.emailVerifiedAt ||
            !recipient.emailNotifications ||
            recipient.email !== message.to
          ) {
            await this.jobs.updateOne(
              { _id: job._id, leaseId },
              { $set: { status: 'SKIPPED' }, $unset: { payload: 1, leaseId: 1, leaseUntil: 1 } },
            );
            continue;
          }
        }
        await this.transport.send(message, job.id);
        await this.jobs.updateOne(
          { _id: job._id, leaseId },
          {
            $set: { status: 'SENT', sentAt: new Date() },
            $unset: { payload: 1, leaseId: 1, leaseUntil: 1 },
          },
        );
      } catch {
        // Never persist provider errors: they can contain recipient addresses or credentials.
        await this.jobs.updateOne(
          { _id: job._id, leaseId },
          {
            $set: {
              status: job.attempts >= 8 ? 'FAILED' : 'PENDING',
              nextAttemptAt: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** job.attempts)),
            },
            $unset: { leaseId: 1, leaseUntil: 1 },
          },
        );
      }
    }
  }
}
