import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PROVIDER_MANAGEMENT } from './contracts';
import { Hotel, HotelSchema } from '../hotels/hotel.schema';
import { AirlineProfile, AirlineProfileSchema } from '../flights/flights.schema';
import { ProviderManagementAdapter } from './provider-management.adapter';
// BOOKING_ACCESS and BOOKING_READER are provided by BookingsIntegrationModule.
@Global()
@Module({
  imports: [MongooseModule.forFeature([
    { name: Hotel.name, schema: HotelSchema },
    { name: AirlineProfile.name, schema: AirlineProfileSchema },
  ])],
  providers: [
    ProviderManagementAdapter,
    {
      provide: PROVIDER_MANAGEMENT,
      useExisting: ProviderManagementAdapter,
    },
  ],
  exports: [PROVIDER_MANAGEMENT, ProviderManagementAdapter],
})
export class IntegrationsModule {}
