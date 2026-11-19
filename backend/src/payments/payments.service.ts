import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Stripe from 'stripe';
import { Payment, PolicyAcceptance } from './payments.schema';
import { CreatePaymentDto } from './payments.dto';
import { BookingType, PaymentStatus, PLATFORM_CURRENCY } from './payments.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notifications.schema';
import { BookingPaymentSource } from './booking-payment-source';
import { FlightBookingsService } from '../flight-bookings/flight-bookings.service';
import { createHash } from 'crypto';

@Injectable()
export class PaymentsService {
  private stripe: Stripe;
  private readonly webhookSecret?: string;

  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
    @InjectModel(PolicyAcceptance.name) private policyAcceptanceModel: Model<PolicyAcceptance>,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly bookingSource: BookingPaymentSource,
    private readonly flightBookings: FlightBookingsService,
  ) {
    const stripeKey =
      this.configService.get<string>('STRIPE_SECRET_KEY') ||
      'sk_test_dummy_key_for_testing_and_evaluation';
    this.stripe = new Stripe(stripeKey);
    this.webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
  }

  async createPayment(userId: string, dto: CreatePaymentDto) {
    const quote = await this.bookingSource.payable(userId, dto.bookingType, dto.bookingId);
    dto = { ...dto, bookingId: new Types.ObjectId(dto.bookingId).toHexString() };
    // PAY-02: Verify policy acceptance and timestamp before payment
    const acceptance = await this.policyAcceptanceModel.findOne({
      bookingId: dto.bookingId,
      bookingType: dto.bookingType,
      userId: new Types.ObjectId(userId),
      accepted: true,
    });

    if (!acceptance) {
      throw new BadRequestException({
        code: 'POLICY_ACCEPTANCE_REQUIRED',
        message:
          'Provider policies must be displayed and accepted before proceeding to payment (PAY-02).',
      });
    }

    const existing = await this.paymentModel.findOne({ bookingId: dto.bookingId, bookingType: dto.bookingType, userId: new Types.ObjectId(userId) });
    if (existing) {
      if (![PaymentStatus.PENDING, PaymentStatus.FAILED].includes(existing.status)) throw new ConflictException('Booking is already paid');
      if (Math.round(existing.amount * 100) !== quote.amountCents || existing.currency !== quote.currency) throw new ConflictException('Existing payment price differs from booking');
      return { paymentId: existing.id, clientSecret: existing.stripeClientSecret, amount: existing.amount, currency: existing.currency, status: existing.status, policyAcceptedAt: existing.policyAcceptedAt };
    }

    // PAY-04: Single platform currency enforcement
    const amount = quote.amountCents / 100;
    const currency = quote.currency.toLowerCase();

    // Call Stripe test mode PaymentIntent
    if (!this.configService.get<string>('STRIPE_SECRET_KEY')) {
      throw new ServiceUnavailableException('Stripe payments are not configured');
    }
    let paymentIntentId: string;
    let clientSecret: string;

    try {
      const intent = await this.stripe.paymentIntents.create({
        amount: quote.amountCents,
        currency,
        metadata: {
          bookingId: dto.bookingId,
          bookingType: dto.bookingType,
          userId,
        },
      }, { idempotencyKey: `booking:${dto.bookingType}:${dto.bookingId}` });
      paymentIntentId = intent.id;
      if (!intent.client_secret) throw new Error('Missing client secret');
      clientSecret = intent.client_secret;
    } catch {
      throw new ServiceUnavailableException('Payment provider could not create a payment');
    }

    const payment = new this.paymentModel({
      _id: new Types.ObjectId(createHash('sha256').update(`${dto.bookingType}:${dto.bookingId}`).digest('hex').slice(0, 24)),
      bookingId: dto.bookingId,
      bookingType: dto.bookingType,
      userId: new Types.ObjectId(userId),
      amount,
      currency: PLATFORM_CURRENCY,
      stripePaymentIntentId: paymentIntentId,
      stripeClientSecret: clientSecret,
      status: PaymentStatus.PENDING,
      policyAccepted: true,
      policyAcceptedAt: acceptance.acceptedAt,
      createdAt: new Date(),
    });

    try {
      await payment.save();
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      // Concurrent creation uses the same Stripe key and the same local record key.
      const winner = await this.paymentModel.findById(payment._id);
      if (!winner || winner.stripePaymentIntentId !== paymentIntentId) throw error;
      return { paymentId: winner.id, clientSecret: winner.stripeClientSecret, amount: winner.amount, currency: winner.currency, status: winner.status, policyAcceptedAt: winner.policyAcceptedAt };
    }

    return {
      paymentId: payment.id,
      clientSecret: payment.stripeClientSecret,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      policyAcceptedAt: payment.policyAcceptedAt,
    };
  }

  async retryPayment(userId: string, paymentId: string) {
    const payment = await this.paymentModel.findById(paymentId);
    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    if (payment.userId.toString() !== userId) {
      throw new ForbiddenException('Resource access denied');
    }

    if (![PaymentStatus.PENDING, PaymentStatus.FAILED].includes(payment.status)) {
      throw new BadRequestException('Payment cannot be retried');
    }
    const quote = await this.bookingSource.payable(userId, payment.bookingType, payment.bookingId);
    if (quote.amountCents !== Math.round(payment.amount * 100) || quote.currency !== payment.currency) {
      throw new BadRequestException('Payment does not match booking price');
    }

    const changed = await this.paymentModel.updateOne(
      { _id: payment._id, status: { $in: [PaymentStatus.PENDING, PaymentStatus.FAILED] } },
      { $inc: { retryCount: 1 }, $set: { status: PaymentStatus.PENDING } },
    );
    if (!changed.modifiedCount) throw new ConflictException('Payment state changed');
    payment.retryCount += 1;
    payment.status = PaymentStatus.PENDING;

    return {
      paymentId: payment.id,
      clientSecret: payment.stripeClientSecret,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      retryCount: payment.retryCount,
    };
  }

  async getPayment(paymentId: string, userId: string, isAdmin = false) {
    const payment = await this.paymentModel.findById(paymentId);
    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    if (!isAdmin && payment.userId.toString() !== userId) {
      throw new ForbiddenException('Resource access denied');
    }

    return {
      id: payment.id,
      bookingId: payment.bookingId,
      bookingType: payment.bookingType,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      transactionId: payment.transactionId || payment.stripePaymentIntentId,
      retryCount: payment.retryCount,
      policyAccepted: payment.policyAccepted,
      policyAcceptedAt: payment.policyAcceptedAt,
      createdAt: payment.createdAt,
    };
  }

  async handleWebhook(rawBody: string | Buffer | Stripe.Event, signature?: string) {
    let event: Stripe.Event;

    if (!this.webhookSecret) {
      throw new ServiceUnavailableException('Stripe webhook is not configured');
    }
    if (!signature) {
      throw new BadRequestException('Stripe signature is required');
    }
    {
      if (typeof rawBody !== 'string' && !Buffer.isBuffer(rawBody)) {
        throw new BadRequestException('Webhook signature verification failed: raw body required');
      }
      try {
        event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
      } catch {
        throw new BadRequestException('Webhook signature verification failed');
      }
    }

    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object as Stripe.PaymentIntent;
      const payment = await this.paymentModel.findOne({
        stripePaymentIntentId: intent.id,
      });

      if (payment) {
        if (intent.status !== 'succeeded' || intent.amount_received !== Math.round(payment.amount * 100) ||
          intent.currency !== payment.currency.toLowerCase() || intent.metadata?.bookingId !== payment.bookingId ||
          intent.metadata?.bookingType !== payment.bookingType || intent.metadata?.userId !== payment.userId.toString()) {
          throw new BadRequestException('Stripe payment does not match the booking payment record');
        }
        await this.paymentModel.updateOne(
          { _id: payment._id, status: { $in: [PaymentStatus.PENDING, PaymentStatus.FAILED] } },
          { $set: { status: PaymentStatus.SUCCEEDED, transactionId: typeof intent.latest_charge === 'string' ? intent.latest_charge : intent.id } },
        );
        // Reconcile on replay too: a process may have stopped after persisting payment success.
        const current = await this.paymentModel.findById(payment._id);
        if (current?.status === PaymentStatus.SUCCEEDED && current.bookingType === BookingType.FLIGHT) {
          const result = await this.flightBookings.confirmPayment(current.bookingId, current.id as string);
          if (!result.confirmed) {
            await this.paymentModel.updateOne({ _id: current._id, status: PaymentStatus.SUCCEEDED }, { $set: { errorMessage: `REFUND_REQUIRED:${result.reason}` } });
          }
        }
        // Each booking service owns its confirmation notification; payment success alone is not confirmation.
      }
    } else if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object as Stripe.PaymentIntent;
      const payment = await this.paymentModel.findOneAndUpdate({
        stripePaymentIntentId: intent.id,
        status: PaymentStatus.PENDING,
      }, { $set: { status: PaymentStatus.FAILED, errorMessage: intent.last_payment_error?.message || 'Payment failed' } }, { new: true });

      if (payment) {
        // GEN-01: Notify user of payment failure
        await this.notificationsService.createNotification({
          userId: payment.userId,
          title: 'Payment Failed',
          message: `Your payment of ${payment.amount} ${payment.currency} could not be processed. You can retry before the hold expires.`,
          type: NotificationType.GENERAL,
          metadata: {
            bookingId: payment.bookingId,
            paymentId: payment.id,
          },
        });
      }
    }

    return { received: true };
  }
}

