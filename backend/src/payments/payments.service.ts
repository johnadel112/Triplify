import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Stripe from 'stripe';
import { Payment, PolicyAcceptance } from './payments.schema';
import { CreatePaymentDto } from './payments.dto';
import { PaymentStatus, PLATFORM_CURRENCY } from './payments.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notifications.schema';
import { BookingPaymentSource } from './booking-payment-source';

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
  ) {
    const stripeKey =
      this.configService.get<string>('STRIPE_SECRET_KEY') ||
      'sk_test_dummy_key_for_testing_and_evaluation';
    this.stripe = new Stripe(stripeKey);
    this.webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
  }

  async createPayment(userId: string, dto: CreatePaymentDto) {
    const quote = await this.bookingSource.payable(userId, dto.bookingType, dto.bookingId);
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

    await payment.save();

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

    // Increment retry count
    payment.retryCount += 1;
    payment.status = PaymentStatus.PENDING;
    await payment.save();

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
        payment.status = PaymentStatus.SUCCEEDED;
        payment.transactionId = intent.latest_charge?.toString() || intent.id;
        await payment.save();

        // GEN-01: Notify user of booking confirmation
        await this.notificationsService.createNotification({
          userId: payment.userId,
          title: 'Booking Confirmed!',
          message: `Your payment of ${payment.amount} ${payment.currency} for ${payment.bookingType.toLowerCase()} booking was successful and confirmed.`,
          type: NotificationType.BOOKING_CONFIRMED,
          metadata: {
            bookingId: payment.bookingId,
            bookingType: payment.bookingType,
            paymentId: payment.id,
          },
        });
      }
    } else if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object as Stripe.PaymentIntent;
      const payment = await this.paymentModel.findOne({
        stripePaymentIntentId: intent.id,
      });

      if (payment) {
        payment.status = PaymentStatus.FAILED;
        payment.errorMessage = intent.last_payment_error?.message || 'Payment failed';
        await payment.save();

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

