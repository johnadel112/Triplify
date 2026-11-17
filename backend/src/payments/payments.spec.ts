import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { NotificationsService } from '../notifications/notifications.service';
import { PLATFORM_CURRENCY } from './payments.constants';
import { Payment, Refund } from './payments.schema';
import { RefundsService } from './refunds.service';

describe('Payments & Refunds Module (PAY-01, PAY-02, PAY-03, PAY-04)', () => {
  let refundsService: RefundsService;

  beforeEach(() => {
    const mockPaymentModel = {} as Model<Payment>;
    const mockRefundModel = {} as Model<Refund>;
    const mockConfigService = { get: jest.fn().mockReturnValue('sk_test_mock') } as unknown as ConfigService;
    const mockNotificationsService = {
      createNotification: jest.fn().mockResolvedValue({}),
    } as unknown as NotificationsService;

    refundsService = new RefundsService(
      mockPaymentModel,
      mockRefundModel,
      mockConfigService,
      mockNotificationsService,
    );
  });

  describe('PAY-04: Single Platform Currency', () => {
    it('enforces USD as the platform currency for all transactions', () => {
      expect(PLATFORM_CURRENCY).toBe('USD');
    });
  });

  describe('PAY-03: Cancellation Tiers and Refund Calculations', () => {
    it('returns 100% refund for provider-initiated cancellations', () => {
      const percentage = refundsService.calculateRefundPercentage('PROVIDER_CANCELLATION');
      expect(percentage).toBe(100);
    });

    it('calculates 100% refund when user cancels 7 or more days before', () => {
      const percentage = refundsService.calculateRefundPercentage('USER_CANCELLATION', 8);
      expect(percentage).toBe(100);
    });

    it('calculates 50% refund when user cancels between 3 and 6 days before', () => {
      const percentage = refundsService.calculateRefundPercentage('USER_CANCELLATION', 4);
      expect(percentage).toBe(50);
    });

    it('calculates 0% refund when user cancels less than 3 days before', () => {
      const percentage = refundsService.calculateRefundPercentage('USER_CANCELLATION', 1);
      expect(percentage).toBe(0);
    });

    it('supports custom provider cancellation tiers (FLT-09, HTL-10)', () => {
      const customTiers = [
        { daysBefore: 10, refundPercentage: 90 },
        { daysBefore: 5, refundPercentage: 40 },
        { daysBefore: 0, refundPercentage: 0 },
      ];
      expect(refundsService.calculateRefundPercentage('USER_CANCELLATION', 12, customTiers)).toBe(90);
      expect(refundsService.calculateRefundPercentage('USER_CANCELLATION', 6, customTiers)).toBe(40);
      expect(refundsService.calculateRefundPercentage('USER_CANCELLATION', 2, customTiers)).toBe(0);
    });
  });
});
