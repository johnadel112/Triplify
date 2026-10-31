import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { AuditLog, NotificationOutbox } from './audit.schema';
import { CLOCK, Clock } from '../common/domain';
@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLog.name) private logs: Model<AuditLog>,
    @InjectModel(NotificationOutbox.name) private outbox: Model<NotificationOutbox>,
    @Inject(CLOCK) private clock: Clock,
  ) {}
  async record(
    actorId: string,
    action: string,
    targetId: string,
    targetType: string,
    transaction: ClientSession,
    beforeStatus?: string,
    afterStatus?: string,
    notify = true,
  ) {
    const occurredAt = this.clock.now();
    await this.logs.create(
      [
        {
          actorId,
          action,
          targetId,
          targetType,
          beforeStatus,
          afterStatus,
          occurredAt,
          outcome: 'SUCCESS',
        },
      ],
      { session: transaction },
    );
    if (notify)
      await this.outbox.create(
        [
          {
            eventId: randomUUID(),
            actorId,
            action,
            targetId,
            targetType,
            status: afterStatus,
            occurredAt,
          },
        ],
        { session: transaction },
      );
  }
}
