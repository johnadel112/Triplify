import { Model } from 'mongoose';
import { hash } from 'bcryptjs';
import { isEmail } from 'class-validator';
import { User } from '../users/user.schema';
import { UserRole } from '../common/domain';
import { Airport, City, Country, Currency } from '../reference-data/reference.schema';
import { airports, cities, countries, currencies } from '../reference-data/seed-data';

export async function seedAdmin(
  users: Model<User>,
  credentials: { email: string; name: string; password: string },
) {
  const email = credentials.email.trim().toLowerCase();
  const name = credentials.name.trim();
  const password = credentials.password;
  if (
    !isEmail(email) ||
    !name ||
    name.length > 100 ||
    !/^(?=.*[A-Za-z])(?=.*\d)[\x20-\x7E]{12,72}$/.test(password)
  )
    throw new Error('Invalid seed credentials');
  await users.init();
  const existing = await users.findOne({ email });
  if (existing) {
    if (existing.role !== UserRole.ADMIN)
      throw new Error('Seed email belongs to non-admin; refusing promotion');
    return { created: false };
  }
  await users.create({ name, email, passwordHash: await hash(password, 12), role: UserRole.ADMIN });
  return { created: true };
}
export async function seedReference(models: {
  countries: Model<Country>;
  cities: Model<City>;
  airports: Model<Airport>;
  currencies: Model<Currency>;
}) {
  for (const city of cities) new Intl.DateTimeFormat('en', { timeZone: city.timeZone });
  await Promise.all(Object.values(models).map((model) => model.init()));
  for (const record of countries)
    await models.countries.updateOne(
      { code: record.code },
      { $set: record },
      { upsert: true, runValidators: true },
    );
  for (const record of cities)
    await models.cities.updateOne(
      { code: record.code },
      { $set: record },
      { upsert: true, runValidators: true },
    );
  for (const record of airports)
    await models.airports.updateOne(
      { iataCode: record.iataCode },
      { $set: record },
      { upsert: true, runValidators: true },
    );
  for (const record of currencies)
    await models.currencies.updateOne(
      { code: record.code },
      { $set: record },
      { upsert: true, runValidators: true },
    );
}
