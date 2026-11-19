import { getModelToken } from '@nestjs/mongoose';
import { seedContext } from './seed-context';
import { Airport, City, Country, Currency } from '../src/reference-data/reference.schema';
import { seedReference } from '../src/database/seeding';
async function run() {
  const app = await seedContext();
  try {
    await seedReference({
      countries: app.get(getModelToken(Country.name)),
      cities: app.get(getModelToken(City.name)),
      airports: app.get(getModelToken(Airport.name)),
      currencies: app.get(getModelToken(Currency.name)),
    });
    console.log('Reference dataset v2 seeded (8 countries, 8 cities, 8 airports, 2 currencies)');
  } finally {
    await app.close();
  }
}
run().catch(() => {
  console.error('Reference seed failed; check configuration and database availability');
  process.exitCode = 1;
});
