import { connect, disconnect, model } from 'mongoose';
import { AirlineProfile, AirlineProfileSchema, Flight, FlightSchema } from '../src/flights/flights.schema';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  const apply = process.argv.includes('--apply');
  await connect(uri, { serverSelectionTimeoutMS: 10000 });
  const airlines = model(AirlineProfile.name, AirlineProfileSchema);
  const flights = model(Flight.name, FlightSchema);
  const profiles = await airlines.find().select('_id moderatorId name').lean();
  const changes: Array<{ airline: string; moderatorId: string; flights: number }> = [];
  for (const profile of profiles) {
    if (profile._id.equals(profile.moderatorId)) continue;
    const filter = { airlineId: profile.moderatorId };
    const count = await flights.countDocuments(filter);
    if (!count) continue;
    changes.push({ airline: profile._id.toString(), moderatorId: profile.moderatorId.toString(), flights: count });
    if (apply) await flights.updateMany(filter, { $set: { airlineId: profile._id } });
  }
  const validation = await Promise.all(changes.map(async (change) => ({
    ...change,
    remainingLegacyFlights: await flights.countDocuments({ airlineId: change.moderatorId }),
  })));
  process.stdout.write(`${JSON.stringify({
    mode: apply ? 'APPLY' : 'DRY_RUN',
    profiles: changes.length,
    flights: changes.reduce((sum, item) => sum + item.flights, 0),
    validation,
  }, null, 2)}\n`);
}

main().finally(() => disconnect()).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Migration failed'}\n`);
  process.exitCode = 1;
});
