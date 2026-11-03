import { NotificationsService } from './notifications.service';
import { NotificationType } from './notifications.schema';

describe('Notifications Module (GEN-01)', () => {
  let service: NotificationsService;
  let mockNotificationsModel: any;
  let mockOutboxModel: any;

  beforeEach(() => {
    mockNotificationsModel = jest.fn();
    mockNotificationsModel.countDocuments = jest.fn();
    mockNotificationsModel.find = jest.fn();
    mockNotificationsModel.updateOne = jest.fn();
    mockNotificationsModel.updateMany = jest.fn();

    mockOutboxModel = {
      updateOne: jest.fn().mockResolvedValue({}),
    };

    service = new NotificationsService(mockNotificationsModel, mockOutboxModel);
  });

  it('delivers admin outbox events as in-app notifications and marks outbox DELIVERED', async () => {
    const createSpy = jest.spyOn(service, 'createNotification').mockResolvedValue({} as any);

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

