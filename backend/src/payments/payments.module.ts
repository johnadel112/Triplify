import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Payment,
  PaymentSchema,
  PolicyAcceptance,
  PolicyAcceptanceSchema,
  Refund,
  RefundSchema,
} from './payments.schema';
import { PaymentsService } from './payments.service';
import { RefundsService } from './refunds.service';
import { PaymentsController } from './payments.controller';
import { PoliciesController } from './policies.controller';
import { RefundsController } from './refunds.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: PolicyAcceptance.name, schema: PolicyAcceptanceSchema },
      { name: Refund.name, schema: RefundSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [PaymentsController, PoliciesController, RefundsController],
  providers: [PaymentsService, RefundsService],
  exports: [PaymentsService, RefundsService],
})
export class PaymentsModule {}

