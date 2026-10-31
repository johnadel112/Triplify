import { Global, Module, ServiceUnavailableException } from '@nestjs/common';
import { BOOKING_ACCESS, BOOKING_READER, PROVIDER_MANAGEMENT } from './contracts';
const unavailable = (): never => {
  throw new ServiceUnavailableException({
    code: 'INTEGRATION_UNAVAILABLE',
    message: 'Required teammate integration is not configured',
  });
};
@Global()
@Module({
  providers: [
    { provide: BOOKING_ACCESS, useValue: { hasUpcomingConfirmedBookings: unavailable } },
    { provide: BOOKING_READER, useValue: { findBookings: unavailable } },
    {
      provide: PROVIDER_MANAGEMENT,
      useValue: { verifyProvider: unavailable, setProviderActive: unavailable },
    },
  ],
  exports: [BOOKING_ACCESS, BOOKING_READER, PROVIDER_MANAGEMENT],
})
export class IntegrationsModule {}
