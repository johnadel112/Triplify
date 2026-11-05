import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Notification, NotificationSchema } from './notifications.schema';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationOutbox, NotificationOutboxSchema } from '../audit/audit.schema';
import { NOTIFICATION_DELIVERY } from '../integrations/contracts';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: NotificationOutbox.name, schema: NotificationOutboxSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    {
      provide: NOTIFICATION_DELIVERY,
      useExisting: NotificationsService,
    },
  ],
  exports: [NotificationsService, NOTIFICATION_DELIVERY],
})
export class NotificationsModule {}

