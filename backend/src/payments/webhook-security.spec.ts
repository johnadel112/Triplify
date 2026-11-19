import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import Stripe from 'stripe';
import { NotificationsService } from '../notifications/notifications.service';
import { Payment, PolicyAcceptance } from './payments.schema';
import { PaymentsService } from './payments.service';
import { BookingPaymentSource } from './booking-payment-source';
import { FlightBookingsService } from '../flight-bookings/flight-bookings.service';

describe('Stripe webhook authentication (PAY-01)', () => {
  const secret = 'whsec_unit_test_only';
  const stripe = new Stripe('sk_test_unit_test_only');
  const payload = JSON.stringify({ id: 'evt_test', type: 'payment_intent.succeeded', data: { object: { id: 'pi_test' } } });
  let findOne: jest.Mock;
  const service = (configured = true) => new PaymentsService(
    { findOne } as unknown as Model<Payment>,
    {} as Model<PolicyAcceptance>,
    new ConfigService({ STRIPE_SECRET_KEY: 'sk_test_unit_test_only', ...(configured ? { STRIPE_WEBHOOK_SECRET: secret } : {}) }),
    { createNotification: jest.fn() } as unknown as NotificationsService,
    {} as BookingPaymentSource,
    {} as FlightBookingsService,
  );
  const signature = (body = payload, timestamp?: number) => stripe.webhooks.generateTestHeaderString({ payload: body, secret, timestamp });

  beforeEach(() => { findOne = jest.fn().mockResolvedValue(null); });

  it('fails closed when signing secret is missing', async () => {
    await expect(service(false).handleWebhook(payload, signature())).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('rejects unsigned payloads before database access', async () => {
    await expect(service().handleWebhook(payload)).rejects.toBeInstanceOf(BadRequestException);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('rejects parsed objects even with a valid signature', async () => {
    await expect(service().handleWebhook(JSON.parse(payload) as Stripe.Event, signature())).rejects.toBeInstanceOf(BadRequestException);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('rejects altered bodies and expired signatures', async () => {
    await expect(service().handleWebhook(`${payload} `, signature())).rejects.toBeInstanceOf(BadRequestException);
    await expect(service().handleWebhook(payload, signature(payload, Math.floor(Date.now() / 1000) - 600))).rejects.toBeInstanceOf(BadRequestException);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('accepts authentic raw bytes and acknowledges unknown payment references', async () => {
    await expect(service().handleWebhook(Buffer.from(payload), signature())).resolves.toEqual({ received: true });
    expect(findOne).toHaveBeenCalledWith({ stripePaymentIntentId: 'pi_test' });
  });
});
