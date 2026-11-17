import { Injectable, NotFoundException } from '@nestjs/common';
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

  async deliver(event: AdminNotificationEvent): Promise<void> {
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

