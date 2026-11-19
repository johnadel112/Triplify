import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { NotificationsService } from '../notifications/notifications.service';
import { BookingPaymentSource } from './booking-payment-source';
import { BookingType, PaymentStatus } from './payments.constants';
import { Payment, PolicyAcceptance, Refund } from './payments.schema';
import { PaymentsService } from './payments.service';
import { RefundsService } from './refunds.service';

describe('Payment provider failures and server pricing', () => {
  const userId = new Types.ObjectId().toString();
  const bookingId = new Types.ObjectId().toString();
  const config = new ConfigService({ STRIPE_SECRET_KEY: 'sk_test_local_fixture' });
  const notify = jest.fn();

  it('ignores client amount and never persists a fabricated intent after provider failure', async () => {
    const save = jest.fn();
    const paymentModel = jest.fn().mockImplementation((data: object) => ({ ...data, save, id: 'payment' }));
    const create = jest.fn().mockRejectedValue(new Error('provider unavailable'));
    const service = new PaymentsService(
      paymentModel as unknown as Model<Payment>,
      { findOne: jest.fn().mockResolvedValue({ acceptedAt: new Date() }) } as unknown as Model<PolicyAcceptance>,
      config, { createNotification: notify } as unknown as NotificationsService,
      { payable: jest.fn().mockResolvedValue({ amountCents: 12345, currency: 'USD' }) } as unknown as BookingPaymentSource,
    );
    Object.assign(service, { stripe: { paymentIntents: { create } } });
    const dto = { bookingId, bookingType: BookingType.FLIGHT, amount: 0.01 };
    await expect(service.createPayment(userId, dto)).rejects.toThrow('Payment provider could not create a payment');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ amount: 12345, currency: 'usd' }), { idempotencyKey: `booking:FLIGHT:${bookingId}` });
    expect(paymentModel).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();

    create.mockResolvedValue({ id: 'pi_provider', client_secret: 'provider_secret' });
    await expect(service.createPayment(userId, dto)).resolves.toMatchObject({ amount: 123.45, clientSecret: 'provider_secret' });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it.each(['error', 'pending', 'failed'])('does not claim refund success when provider returns %s', async (status) => {
    const payment = { id: 'payment', amount: 100, userId: new Types.ObjectId(userId), stripePaymentIntentId: 'pi_test', status: PaymentStatus.SUCCEEDED, save: jest.fn() };
    const findOne = jest.fn().mockResolvedValue(payment);
    const refundModel = jest.fn();
    const service = new RefundsService(
      { findOne } as unknown as Model<Payment>, refundModel as unknown as Model<Refund>,
      config, { createNotification: notify } as unknown as NotificationsService,
    );
    const create = status === 'error' ? jest.fn().mockRejectedValue(new Error('offline')) : jest.fn().mockResolvedValue({ id: 're_provider', status });
    Object.assign(service, { stripe: { refunds: { create } } });
    await expect(service.processRefund(userId, { bookingId, bookingType: BookingType.FLIGHT, reason: 'USER_CANCELLATION', daysBefore: 10 }, [{ daysBefore: 0, refundPercentage: 100 }])).rejects.toThrow('Refund provider has not confirmed');
    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ userId: new Types.ObjectId(userId) }));
    expect(refundModel).not.toHaveBeenCalled();
    expect(payment.save).not.toHaveBeenCalled();
    expect(payment.status).toBe(PaymentStatus.SUCCEEDED);
  });
});
