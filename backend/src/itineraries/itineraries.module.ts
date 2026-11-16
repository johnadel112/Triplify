import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Airport,
  AirportSchema,
  City,
  CitySchema,
  Country,
  CountrySchema,
  Currency,
  CurrencySchema,
} from '../reference-data/reference.schema';
import { User, UserSchema } from '../users/user.schema';
import { ActivitiesController } from './activities.controller';
import { BudgetsController } from './budgets.controller';
import { FxRatesService } from './fx-rates.service';
import { ItinerariesController } from './itineraries.controller';
import { Itinerary, ItinerarySchema } from './itineraries.schema';
import { ItinerariesService } from './itineraries.service';
import { TransportCostsController } from './transport-costs.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Itinerary.name, schema: ItinerarySchema },
      { name: User.name, schema: UserSchema },
      { name: City.name, schema: CitySchema },
      { name: Country.name, schema: CountrySchema },
      { name: Airport.name, schema: AirportSchema },
      { name: Currency.name, schema: CurrencySchema },
    ]),
  ],
  controllers: [
    ItinerariesController,
    ActivitiesController,
    BudgetsController,
    TransportCostsController,
  ],
  providers: [ItinerariesService, FxRatesService],
  exports: [ItinerariesService, FxRatesService],
})
export class ItinerariesModule {}
