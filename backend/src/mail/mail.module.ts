import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Notification, NotificationSchema } from '../notifications/notifications.schema';
import { User, UserSchema } from '../users/user.schema';
import { MailJob, MailJobSchema } from './mail.schema';
import { MailService, MailTransport } from './mail.service';
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MailJob.name, schema: MailJobSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [MailService, MailTransport],
  exports: [MailService],
})
export class MailModule {}
