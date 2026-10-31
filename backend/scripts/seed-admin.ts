import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { seedContext } from './seed-context';
import { User } from '../src/users/user.schema';
import { seedAdmin } from '../src/database/seeding';
async function run() {
  const app = await seedContext();
  try {
    const config = app.get(ConfigService);
    const email = config.getOrThrow<string>('ADMIN_SEED_EMAIL').trim().toLowerCase();
    const password = config.getOrThrow<string>('ADMIN_SEED_PASSWORD');
    const name = config.getOrThrow<string>('ADMIN_SEED_NAME').trim();
    const result = await seedAdmin(app.get<Model<User>>(getModelToken(User.name)), {
      email,
      password,
      name,
    });
    console.log(
      result.created
        ? 'Administrator provisioned'
        : 'Administrator already exists; password unchanged',
    );
  } finally {
    await app.close();
  }
}
run().catch(() => {
  console.error('Admin seed failed; check protected configuration and database availability');
  process.exitCode = 1;
});
