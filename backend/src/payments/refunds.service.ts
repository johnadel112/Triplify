import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Stripe from 'stripe';
import { Payment, Refund } from './payments.schema';
import { ProcessRefundDto } from './payments.dto';
import { BookingType, PaymentStatus, RefundStatus } from './payments.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notifications.schema';
import { RefundBookingSource } from './refund-booking-source';
import { Cron, CronExpression } from '@nestjs/schedule';

export interface CancellationTier {
  daysBefore: number;
  refundPercentage: number;
}

type RefundResult = { message: string; refundAmount: number; refundPercentage: number; status: 'NO_REFUND' }
  | { refundId: string; amount: number; currency: string; refundPercentage: number; status: RefundStatus; stripeRefundId?: string; createdAt: Date };

@Injectable()
export class RefundsService {
  private stripe: Stripe;

  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
    @InjectModel(Refund.name) private refundModel: Model<Refund>,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly bookingSource: RefundBookingSource,
  ) {
    const stripeKey =
      this.configService.get<string>('STRIPE_SECRET_KEY') ||
      'sk_test_dummy_key_for_testing_and_evaluation';
    this.stripe = new Stripe(stripeKey);
  }

  calculateRefundPercentage(
    reason: 'USER_CANCELLATION' | 'PROVIDER_CANCELLATION',
    daysBefore?: number,
    customTiers?: CancellationTier[],
  ): number {
    // Provider-initiated cancellations are always 100% refunded as per PAY-03
    if (reason === 'PROVIDER_CANCELLATION') {
      return 100;
    }

    if (!customTiers || daysBefore === undefined || !Number.isFinite(daysBefore)) {
      throw new BadRequestException('Provider cancellation policy and cancellation time are required');
    }
    const tiers = [...customTiers].sort((a, b) => b.daysBefore - a.daysBefore);
    const days = daysBefore;
    for (const tier of tiers) {
      if (days >= tier.daysBefore) {
        return tier.refundPercentage;
      }
    }

    return 0;
  }

  async processRefund(userId: string, dto: ProcessRefundDto, customTiers?: CancellationTier[]): Promise<RefundResult> {
    // The booking cancellation owns the policy calculation; DTO reason/days are not authorization.
    void customTiers;
    const quote = await this.bookingSource.quote(userId, dto.bookingType, dto.bookingId);
    // Find successful payment for this booking
    const payment = await this.paymentModel.findOne({
      bookingId: dto.bookingId,
      bookingType: dto.bookingType,
      userId: new Types.ObjectId(userId),
      status: { $in: [PaymentStatus.SUCCEEDED, PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED] },
    });

    if (!payment) {
      throw new NotFoundException('No completed payment found for this booking');
    }

    if (quote.currency !== payment.currency || quote.totalCents !== Math.round(payment.amount * 100) ||
      !Number.isSafeInteger(quote.amountCents) || quote.amountCents < 0 || quote.amountCents > quote.totalCents) {
      throw new ConflictException('Refund does not match the paid booking');
    }
    const refundAmount = quote.amountCents / 100;
    const refundPercentage = quote.totalCents ? quote.amountCents * 100 / quote.totalCents : 0;

    if (refundAmount <= 0) {
      return {
        message: 'No refund applicable based on provider cancellation tiers (0%)',
        refundAmount: 0,
        refundPercentage: 0,
        status: 'NO_REFUND',
      };
    }

    // Reuse historical records; new jobs use the payment ObjectId as their deterministic primary key.
    let refund = await this.refundModel.findOne({ paymentId: payment.id as string });
    if (!refund) refund = await this.refundModel.findOneAndUpdate({ _id: payment._id }, { $setOnInsert: {
      paymentId: payment.id, bookingId: dto.bookingId, bookingType: dto.bookingType,
      userId: payment.userId, amount: refundAmount, currency: payment.currency,
      reason: quote.reason, refundPercentage, status: RefundStatus.PENDING,
    } }, { upsert: true, new: true });
    if (!refund) throw new ServiceUnavailableException('Could not persist refund request');
    if (refund.amount !== refundAmount) throw new ConflictException('An existing refund has a different amount');

    if (refund.status !== RefundStatus.SUCCEEDED) {
    try {
      if (!refund.stripeRefundId && Date.now() - refund.createdAt.getTime() > 23 * 60 * 60 * 1000) {
        throw new ServiceUnavailableException('Manual provider reconciliation required before retrying an old refund');
      }
      const stripeRefund = refund.stripeRefundId ? await this.stripe.refunds.retrieve(refund.stripeRefundId) : await this.stripe.refunds.create({
        payment_intent: payment.stripePaymentIntentId,
        amount: quote.amountCents,
      }, { idempotencyKey: `cancellation-refund:${payment.id as string}` });
      const status = stripeRefund.status === 'succeeded' ? RefundStatus.SUCCEEDED
        : stripeRefund.status === 'failed' || stripeRefund.status === 'canceled' ? RefundStatus.FAILED : RefundStatus.PENDING;
      // Concurrent responses must never downgrade a completed job.
      await this.refundModel.updateOne({ _id: refund._id, status: { $ne: RefundStatus.SUCCEEDED } }, {
        $set: { stripeRefundId: stripeRefund.id, status }, $unset: { errorMessage: 1 },
      });
    } catch {
      await this.refundModel.updateOne({ _id: refund._id, status: { $ne: RefundStatus.SUCCEEDED } }, {
        $set: { status: RefundStatus.FAILED, errorMessage: 'Provider request failed; retry with the same idempotency key' },
      });
      const current = await this.refundModel.findById(refund._id);
      if (current?.status === RefundStatus.SUCCEEDED) return this.processRefund(userId, dto);
      await this.bookingSource.recordStatus(dto.bookingType, dto.bookingId, RefundStatus.FAILED, refund.id as string);
      throw new ServiceUnavailableException('Refund provider has not confirmed a successful refund');
    }
    refund = (await this.refundModel.findById(refund._id))!;
    }
    await this.bookingSource.recordStatus(dto.bookingType, dto.bookingId, refund.status, refund.id as string);
    if (refund.status === RefundStatus.SUCCEEDED) {
    // Update payment status
    await this.paymentModel.updateOne({ _id: payment._id }, { $set: {
      status: quote.amountCents === quote.totalCents ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED,
    }, $unset: { errorMessage: 1 } });

    // GEN-01: Notify user of refund
    await this.notificationsService.createNotificationOnce(refund.id as string, {
      userId: payment.userId,
      title: 'Refund Processed',
      message: `A refund of ${refundAmount} ${refund.currency} (${refundPercentage}%) has been issued for your ${dto.bookingType.toLowerCase()} cancellation.`,
      type: NotificationType.REFUND_ISSUED,
      metadata: {
        bookingId: dto.bookingId,
        refundId: refund.id,
        amount: refundAmount,
      },
    });
    await this.refundModel.updateOne({ _id: refund._id }, { $set: { settled: true } });
    }

    return {
      refundId: refund.id as string,
      amount: refund.amount,
      currency: refund.currency,
      refundPercentage: refund.refundPercentage,
      status: refund.status,
      stripeRefundId: refund.stripeRefundId,
      createdAt: refund.createdAt,
    };
  }

  async requestRefund(input: { bookingId: string; userId: string }) {
    await this.processRefund(input.userId, { bookingId: input.bookingId, bookingType: BookingType.FLIGHT, reason: 'USER_CANCELLATION' });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async reconcileRefunds() {
    const jobs = await this.refundModel.find({ settled: { $ne: true } }).limit(100).lean();
    for (const job of jobs) {
      try {
        await this.processRefund(job.userId.toString(), { bookingId: job.bookingId, bookingType: job.bookingType, reason: job.reason });
      } catch { /* Failure is persisted on the job; a later sweep retries with the same provider key. */ }
    }
  }

  async getRefund(refundId: string, userId: string, isAdmin = false) {
    const refund = await this.refundModel.findById(refundId);
    if (!refund) {
      throw new NotFoundException('Refund not found');
    }

    if (!isAdmin && refund.userId.toString() !== userId) {
      throw new ForbiddenException('Resource access denied');
    }

    return {
      id: refund.id,
      paymentId: refund.paymentId,
      bookingId: refund.bookingId,
      bookingType: refund.bookingType,
      amount: refund.amount,
      currency: refund.currency,
      stripeRefundId: refund.stripeRefundId,
      reason: refund.reason,
      refundPercentage: refund.refundPercentage,
      status: refund.status,
      createdAt: refund.createdAt,
    };
  }
}

