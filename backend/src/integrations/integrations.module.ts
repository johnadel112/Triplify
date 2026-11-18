import { Global, Module, ServiceUnavailableException } from '@nestjs/common';
import { PROVIDER_MANAGEMENT } from './contracts';
const unavailable = (): never => {
  throw new ServiceUnavailableException({
    code: 'INTEGRATION_UNAVAILABLE',
    message: 'Required teammate integration is not configured',
  });
};
// BOOKING_ACCESS and BOOKING_READER are provided by BookingsIntegrationModule.
@Global()
@Module({
  providers: [
    {
      provide: PROVIDER_MANAGEMENT,
      useValue: { verifyProvider: unavailable, setProviderActive: unavailable },
    },
  ],
  exports: [PROVIDER_MANAGEMENT],
})
export class IntegrationsModule {}
