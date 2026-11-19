import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Model } from 'mongoose';
import request from 'supertest';
import Stripe from 'stripe';
import { PaymentsController } from '../src/payments/payments.controller';
import { PaymentsService } from '../src/payments/payments.service';
import { Payment, PolicyAcceptance } from '../src/payments/payments.schema';
import { NotificationsService } from '../src/notifications/notifications.service';
import { BookingPaymentSource } from '../src/payments/booking-payment-source';
import { FlightBookingsService } from '../src/flight-bookings/flight-bookings.service';

// Real HTTP parsing and Stripe signature verification; persistence is explicitly mocked.
describe('Payment webhook raw-body transport (PAY-01)', () => {
  let app: INestApplication;
  const findOne = jest.fn().mockResolvedValue(null);
  const secret = 'whsec_http_test_only';
  const stripe = new Stripe('sk_test_http_test_only');
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [{ provide: PaymentsService, useValue: new PaymentsService(
        { findOne } as unknown as Model<Payment>, {} as Model<PolicyAcceptance>,
        new ConfigService({ STRIPE_SECRET_KEY: 'sk_test_http_test_only', STRIPE_WEBHOOK_SECRET: secret }),
        {} as NotificationsService, {} as BookingPaymentSource, {} as FlightBookingsService,
      ) }],
    }).compile();
    app = module.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  it('verifies the exact bytes delivered through Express', async () => {
    const payload = '{ "type": "payment_intent.succeeded", "data": { "object": { "id": "pi_http" } } }';
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/api/payments/webhook').set('Content-Type', 'application/json')
      .set('stripe-signature', signature).send(payload).expect(201, { received: true });
    expect(findOne).toHaveBeenCalledWith({ stripePaymentIntentId: 'pi_http' });
  });

  it('rejects unsigned HTTP requests', async () => {
    findOne.mockClear();
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/api/payments/webhook').send({ type: 'payment_intent.succeeded' }).expect(400);
    expect(findOne).not.toHaveBeenCalled();
  });
});
