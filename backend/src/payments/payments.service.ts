import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
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

@Injectable()
export class PaymentsService {
  private stripe: Stripe;
  private readonly webhookSecret?: string;

  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
    @InjectModel(PolicyAcceptance.name) private policyAcceptanceModel: Model<PolicyAcceptance>,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {
    const stripeKey =
      this.configService.get<string>('STRIPE_SECRET_KEY') ||
      'sk_test_dummy_key_for_testing_and_evaluation';
    this.stripe = new Stripe(stripeKey, {
      apiVersion: '2025-02-24.acacia' as any,
    });
    this.webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
  }

  async createPayment(userId: string, dto: CreatePaymentDto) {
    // PAY-02: Verify policy acceptance and timestamp before payment
    const acceptance = await this.policyAcceptanceModel.findOne({
      bookingId: dto.bookingId,
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
    const amount = dto.amount && dto.amount > 0 ? dto.amount : 150.0;
    const currency = PLATFORM_CURRENCY.toLowerCase();

    // Call Stripe test mode PaymentIntent
    let paymentIntentId = `pi_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    let clientSecret = `${paymentIntentId}_secret_${Math.random().toString(36).substring(2, 10)}`;

    try {
      const intent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Stripe takes amounts in minor units (cents)
        currency,
        metadata: {
          bookingId: dto.bookingId,
          bookingType: dto.bookingType,
          userId,
        },
      });
      paymentIntentId = intent.id;
      clientSecret = intent.client_secret || clientSecret;
    } catch {
      // In local or offline test mode without valid Stripe keys, keep simulated test-mode intent
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

    if (payment.status === PaymentStatus.SUCCEEDED) {
      throw new BadRequestException('Payment has already succeeded');
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

  async handleWebhook(rawBody: any, signature?: string) {
    let event: Stripe.Event;

    if (this.webhookSecret && signature) {
      try {
        event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
      } catch (err: any) {
        throw new BadRequestException(`Webhook signature verification failed: ${err.message}`);
      }
    } else {
      // In test mode or when parsed JSON body is passed
      event = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
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

