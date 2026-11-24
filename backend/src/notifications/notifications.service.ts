import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationType } from './notifications.schema';
import { AdminNotificationEvent, NotificationDeliveryPort } from '../integrations/contracts';
import { NotificationOutbox } from '../audit/audit.schema';

@Injectable()
export class NotificationsService implements NotificationDeliveryPort {
  constructor(
    @InjectModel(Notification.name) private notifications: Model<Notification>,
    @InjectModel(NotificationOutbox.name) private outbox: Model<NotificationOutbox>,
  ) {}

  private readonly log = new Logger(NotificationsService.name);

  /**
   * GEN-01, ACC-15, ACC-16: admin actions are written to the outbox inside their transaction;
   * this sender turns each pending entry into in-app notifications for the affected people.
   * Claiming an entry (PENDING -> DELIVERED) before sending means two runs never send it twice.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async dispatchPending(limit = 100): Promise<number> {
    let sent = 0;
    for (let i = 0; i < limit; i += 1) {
      const event = await this.outbox
        .findOneAndUpdate(
          { deliveryStatus: 'PENDING' },
          { $set: { deliveryStatus: 'DELIVERED' } },
          { sort: { occurredAt: 1 }, new: true },
        )
        .lean();
      if (!event) break;
      try {
        await this.deliver({
          eventId: event.eventId,
          action: event.action,
          targetId: event.targetId,
          targetType: event.targetType,
          actorId: event.actorId,
          occurredAt: event.occurredAt,
        });
        sent += 1;
      } catch (error) {
        await this.outbox.updateOne({ eventId: event.eventId }, { $set: { deliveryStatus: 'PENDING' } });
        this.log.warn(`Notification ${event.eventId} failed: ${error instanceof Error ? error.message : 'unknown'}`);
        break;
      }
    }
    return sent;
  }

  /** ACC-15: the provider's moderators and travelers with upcoming confirmed bookings there. */
  private async providerRecipients(type: string, providerId: string) {
    const db = this.notifications.db;
    const id = new Types.ObjectId(providerId);
    const moderators = await db.collection('users').find({ providerId: id }).project({ _id: 1 }).toArray();
    const travelers: { userId: Types.ObjectId; reference?: string }[] = [];
    if (type === 'HOTEL') {
      const today = new Date().toISOString().slice(0, 10);
      travelers.push(...(await db.collection('hotel_bookings')
        .find({ providerId: id, status: 'CONFIRMED', checkOutDate: { $gt: today } })
        .project({ userId: 1, reference: 1 }).toArray()) as unknown as typeof travelers);
    } else if (type === 'AIRLINE') {
      const owners = [id, ...moderators.map((m) => m._id as Types.ObjectId)];
      const flights = await db.collection('flights').find({ airlineId: { $in: owners } }).project({ _id: 1 }).toArray();
      travelers.push(...(await db.collection('flight_bookings')
        .find({ 'legs.flightId': { $in: flights.map((f) => f._id) }, status: 'CONFIRMED', lastDeparture: { $gt: new Date() } })
        .project({ userId: 1, reference: 1 }).toArray()) as unknown as typeof travelers);
    }
    return { moderators: moderators.map((m) => String(m._id)), travelers };
  }

  async deliver(event: AdminNotificationEvent): Promise<void> {
    if (event.action.startsWith('PROVIDER_') && Types.ObjectId.isValid(event.targetId)) {
      await this.deliverProviderEvent(event);
      await this.outbox.updateOne({ eventId: event.eventId }, { $set: { deliveryStatus: 'DELIVERED' } });
      return;
    }
    if (event.targetType !== 'USER') {
      // Not about a person (e.g. a moderator editing their own airline profile): nothing to send.
      await this.outbox.updateOne({ eventId: event.eventId }, { $set: { deliveryStatus: 'DELIVERED' } });
      return;
    }
    // Generate notification based on the administrative event
    let title = 'System Update';
    let message = `An action was performed on ${event.targetType}: ${event.action}`;
    let notifType = NotificationType.GENERAL;

    if (event.action.includes('SUSPEND') || event.action.includes('DEACTIVATE')) {
      title = 'Account / Provider Suspended';
      message = `Your ${event.targetType.toLowerCase()} has been suspended or deactivated by an administrator.`;
      notifType = NotificationType.ACCOUNT_STATUS_CHANGED;
    } else if (event.action.includes('REACTIVATE')) {
      title = 'Account / Provider Reactivated';
      message = `Your ${event.targetType.toLowerCase()} has been reactivated.`;
      notifType = NotificationType.ACCOUNT_STATUS_CHANGED;
    } else if (event.action === 'MODERATOR_CREATED') {
      title = 'Moderator account created';
      message = 'An administrator created your moderator account. Change the temporary password when you first log in.';
    } else if (event.action === 'PASSWORD_RESET') {
      title = 'Password reset';
      message = 'An administrator reset your password. Set a new password when you next log in.';
    }

    if (Types.ObjectId.isValid(event.targetId)) {
      await this.createNotification({
        userId: event.targetId,
        title,
        message,
        type: notifType,
        metadata: {
          eventId: event.eventId,
          action: event.action,
          targetType: event.targetType,
          occurredAt: event.occurredAt,
        },
      });
    }

    // Mark outbox entry as DELIVERED
    await this.outbox.updateOne(
      { eventId: event.eventId },
      { $set: { deliveryStatus: 'DELIVERED' } },
    );
  }

  private async deliverProviderEvent(event: AdminNotificationEvent) {
    const type = event.targetType.toUpperCase();
    const label = type === 'AIRLINE' ? 'airline' : 'hotel';
    const { moderators, travelers } = await this.providerRecipients(type, event.targetId);
    const deactivated = event.action === 'PROVIDER_DEACTIVATED';
    const verified = event.action === 'PROVIDER_VERIFIED';
    const metadata = { eventId: event.eventId, action: event.action, providerType: type, providerId: event.targetId };
    for (const userId of moderators) {
      await this.createNotification({
        userId,
        title: verified ? `Your ${label} was verified` : deactivated ? `Your ${label} was deactivated` : `Your ${label} was reactivated`,
        message: verified
          ? `An administrator verified your ${label}; its listings can now be booked.`
          : deactivated
            ? `An administrator deactivated your ${label}. Its listings are hidden from search and cannot be booked; confirmed bookings remain valid.`
            : `An administrator reactivated your ${label}. Its listings are visible and bookable again.`,
        type: NotificationType.PROVIDER_STATUS_CHANGED,
        metadata,
      });
    }
    if (verified) return;
    const notified = new Set<string>();
    for (const booking of travelers) {
      const userId = String(booking.userId);
      if (notified.has(userId)) continue;
      notified.add(userId);
      await this.createNotification({
        userId,
        title: deactivated ? `A ${label} you booked was deactivated` : `A ${label} you booked was reactivated`,
        message: deactivated
          ? `An administrator deactivated a ${label} in your upcoming trip. Your confirmed booking${booking.reference ? ` ${booking.reference}` : ''} remains valid.`
          : `A ${label} in your upcoming trip is active again.`,
        type: NotificationType.PROVIDER_STATUS_CHANGED,
        metadata,
      });
    }
  }

  async createNotification(data: {
    userId: string | Types.ObjectId;
    title: string;
    message: string;
    type: NotificationType;
    metadata?: Record<string, unknown>;
  }): Promise<Notification> {
    const notif = new this.notifications({
      userId: new Types.ObjectId(data.userId.toString()),
      title: data.title,
      message: data.message,
      type: data.type,
      metadata: data.metadata,
      read: false,
      createdAt: new Date(),
    });
    return notif.save();
  }

  async createNotificationOnce(id: string, data: {
    userId: string | Types.ObjectId; title: string; message: string;
    type: NotificationType; metadata?: Record<string, unknown>;
  }) {
    await this.notifications.updateOne({ _id: new Types.ObjectId(id) }, {
      $setOnInsert: { ...data, userId: new Types.ObjectId(data.userId.toString()), read: false, createdAt: new Date() },
    }, { upsert: true });
  }

  async listForUser(userId: string, page = 1, limit = 10) {
    const userObjectId = new Types.ObjectId(userId);
    const query = { userId: userObjectId };

    const [items, total] = await Promise.all([
      this.notifications
        .find(query)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.notifications.countDocuments(query),
    ]);

    return {
      items: items.map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type,
        read: n.read,
        readAt: n.readAt,
        metadata: n.metadata,
        createdAt: n.createdAt,
      })),
      total,
      page,
      pageCount: Math.ceil(total / limit),
    };
  }

  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.notifications.countDocuments({
      userId: new Types.ObjectId(userId),
      read: false,
    });
    return { count };
  }

  async markAsRead(userId: string, notificationId: string): Promise<{ success: boolean }> {
    const result = await this.notifications.updateOne(
      {
        _id: new Types.ObjectId(notificationId),
        userId: new Types.ObjectId(userId),
      },
      {
        $set: { read: true, readAt: new Date() },
      },
    );

    if (result.matchedCount === 0) {
      throw new NotFoundException('Notification not found or access denied');
    }
    return { success: true };
  }

  async markAllAsRead(userId: string): Promise<{ success: boolean; modifiedCount: number }> {
    const result = await this.notifications.updateMany(
      {
        userId: new Types.ObjectId(userId),
        read: false,
      },
      {
        $set: { read: true, readAt: new Date() },
      },
    );
    return { success: true, modifiedCount: result.modifiedCount };
  }
}

