import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { seedContext } from './seed-context';

/**
 * Airlines can now be created by an admin before a moderator is linked (FLT-01). The legacy
 * `moderatorId_1` index is unique on every document, so it treats "no moderator" as a duplicate
 * value and blocks a second such airline. It is replaced by `moderatorId_unique_when_linked`
 * (unique only when a moderator is set), which the app creates itself.
 *
 * Dry run by default: `npm run migrate:airline-moderator-index`; apply with `-- --apply`.
 * Idempotent; it only drops the legacy index, never documents.
 */
async function run() {
  const apply = process.argv.includes('--apply');
  const app = await seedContext();
  try {
    const db = app.get<Connection>(getConnectionToken()).db;
    if (!db) throw new Error('No database connection');
    const exists = (await db.listCollections({ name: 'airlineprofiles' }).toArray()).length > 0;
    const indexes = exists ? await db.collection('airlineprofiles').indexes() : [];
    const legacy = indexes.find(
      (index) => index.name === 'moderatorId_1' && !index.partialFilterExpression && !index.sparse,
    );
    if (legacy && apply) await db.collection('airlineprofiles').dropIndex('moderatorId_1');
    console.log(
      JSON.stringify({
        mode: apply ? 'APPLY' : 'DRY_RUN',
        legacyIndexFound: Boolean(legacy),
        dropped: Boolean(legacy && apply),
        replacementPresent: indexes.some((i) => i.name === 'moderatorId_unique_when_linked'),
      }),
    );
  } finally {
    await app.close();
  }
}
run().catch((error: unknown) => {
  console.error(
    `Index migration failed: ${error instanceof Error ? error.message : 'unknown error'}`,
  );
  process.exitCode = 1;
});
