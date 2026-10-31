import { Test } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { IntegrationsModule } from './integrations.module';
import {
  AdminBookingReaderPort,
  BOOKING_ACCESS,
  BOOKING_READER,
  BookingAccessPort,
  PROVIDER_MANAGEMENT,
} from './contracts';
describe('Production integration defaults', () => {
  it('fails closed for every missing dependency', async () => {
    const module = await Test.createTestingModule({ imports: [IntegrationsModule] }).compile();
    expect(() =>
      module
        .get<BookingAccessPort>(BOOKING_ACCESS)
        .hasUpcomingConfirmedBookings('user', new Date(), undefined!),
    ).toThrow(ServiceUnavailableException);
    expect(() =>
      module.get<AdminBookingReaderPort>(BOOKING_READER).findBookings({ page: 1 }),
    ).toThrow(ServiceUnavailableException);
    const provider = module.get<{ verifyProvider: () => never; setProviderActive: () => never }>(
      PROVIDER_MANAGEMENT,
    );
    expect(() => provider.verifyProvider()).toThrow(ServiceUnavailableException);
    expect(() => provider.setProviderActive()).toThrow(ServiceUnavailableException);
    await module.close();
  });
});
