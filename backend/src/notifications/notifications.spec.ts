import { Model } from 'mongoose';
import { NotificationOutbox } from '../audit/audit.schema';
import { Notification, NotificationType } from './notifications.schema';
import { NotificationsService } from './notifications.service';

describe('Notifications Module (GEN-01)', () => {
  let service: NotificationsService;
  let mockNotificationsModel: jest.Mock & {
    countDocuments: jest.Mock;
    find: jest.Mock;
    updateOne: jest.Mock;
    updateMany: jest.Mock;
  };
  let mockOutboxModel: { updateOne: jest.Mock };

  beforeEach(() => {
    mockNotificationsModel = Object.assign(jest.fn(), {
      countDocuments: jest.fn(),
      find: jest.fn(),
      updateOne: jest.fn(),
      updateMany: jest.fn(),
    });

    mockOutboxModel = {
      updateOne: jest.fn().mockResolvedValue({}),
    };

    service = new NotificationsService(
      mockNotificationsModel as unknown as Model<Notification>,
      mockOutboxModel as unknown as Model<NotificationOutbox>,
    );
  });

  it('delivers admin outbox events as in-app notifications and marks outbox DELIVERED', async () => {
    const createSpy = jest
      .spyOn(service, 'createNotification')
      .mockResolvedValue({} as Notification);

    await service.deliver({
      eventId: 'evt-123',
      action: 'USER_SUSPENDED',
      targetId: '507f1f77bcf86cd799439011',
      targetType: 'USER',
      actorId: '507f1f77bcf86cd799439012',
      occurredAt: new Date(),
    });

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: '507f1f77bcf86cd799439011',
        type: NotificationType.ACCOUNT_STATUS_CHANGED,
      }),
    );
    expect(mockOutboxModel.updateOne).toHaveBeenCalledWith(
      { eventId: 'evt-123' },
      { $set: { deliveryStatus: 'DELIVERED' } },
    );
  });

  it('retrieves unread notification count for a user', async () => {
    mockNotificationsModel.countDocuments.mockResolvedValue(4);

    const result = await service.getUnreadCount('507f1f77bcf86cd799439011');
    expect(result).toEqual({ count: 4 });
  });

  it('marks a notification as read', async () => {
    mockNotificationsModel.updateOne.mockResolvedValue({ matchedCount: 1 });

    const result = await service.markAsRead('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439099');
    expect(result).toEqual({ success: true });
  });
});
