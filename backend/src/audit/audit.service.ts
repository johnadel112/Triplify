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
    transaction?: ClientSession,
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
      transaction ? { session: transaction } : undefined,
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
        transaction ? { session: transaction } : undefined,
      );
  }

  async findLogs(page = 1, limit = 10) {
    const [items, total] = await Promise.all([
      this.logs
        .find()
        .sort({ occurredAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.logs.countDocuments(),
    ]);
    return {
      items: items.map((l) => ({
        id: l.id,
        actorId: l.actorId,
        action: l.action,
        targetId: l.targetId,
        targetType: l.targetType,
        beforeStatus: l.beforeStatus,
        afterStatus: l.afterStatus,
        outcome: l.outcome,
        occurredAt: l.occurredAt,
      })),
      total,
      page,
      pageCount: Math.ceil(total / limit),
    };
  }
}
