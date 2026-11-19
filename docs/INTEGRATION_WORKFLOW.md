# Integration and test workflow

Milestone 1: 2026-11-20. Milestone 2: 2026-12-11. Read
[FINALIZATION_STATUS.md](FINALIZATION_STATUS.md) before claiming readiness.

## Branches

The audited base is `feature/john-auth-admin` at `b03565a`, containing PRs #10–#15.
Repairs are on `fix/project-finalization`. Create `develop` from the tested repair
commit; retain the existing feature branch until the team switches. Open a draft
integration PR from `develop` into `main` while readiness blockers remain. Do not
merge without the repository owner's explicit approval. Never force-push shared branches.

Protect `main` and `develop`: require a PR, one teammate approval, resolved review
threads, and the `Backend CI / verify` check. Prevent force pushes and deletion.
Confirm the check name in GitHub after its first run. CI covers pushes and PRs to
main/develop and the existing shared integration branch.

## Reproduce validation

Use Node 22.22.3 or newer within Node 22, or Node 24.15.0 or newer within Node 24.
The audit host's Node 24.14.0 emits engine warnings for the locked CLI dependencies.
From `backend/`:

```sh
npm ci
npm run lint
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

On Windows with npm.ps1 blocked by execution policy, use `npm.cmd` for each command.
Unit tests include a flight concurrency suite backed by a real local MongoDB replica
set. E2e suites create their own isolated replica sets through mongodb-memory-server;
their cleanup deletes only those test databases. CI pins and caches the MongoDB 7.0.24
binary. It requires no Atlas credentials and no developers' .env files. Tests must
never be redirected to a shared or production database.

There is no separate `test:integration` script. The `test:e2e` command includes
hotel inventory, booking/payment and moderation integration suites. Stripe API calls
are explicitly mocked in those suites, while webhook signatures use real local SDK
cryptography. These are not Stripe sandbox network tests.

## Local and Atlas configuration

Copy `backend/.env.example` to `backend/.env` (ignored by Git). Set a random
JWT_ACCESS_SECRET of at least 32 characters, exact FRONTEND_URL origins, and a database
URI. Local example: `mongodb://127.0.0.1:27017/triplify_dev?replicaSet=rs0`.
Atlas template: `mongodb+srv://<user>:<password>@<cluster>/<dedicated-database>`.
Use separate users/databases for development, tests and shared environments, with
least-privilege access and explicit network access rules. Do not seed/reset shared data.
Standalone MongoDB does not support the transactions used here; use a replica set.
The URI validator accepts Atlas SRV URIs, but cluster access/transaction support has
not been tested against a real Atlas cluster in this task.

CI currently needs **no application secrets**. A future opt-in external sandbox job
must receive a dedicated test Atlas URI and Stripe test keys via GitHub Actions secrets,
never via the repository, PR text or logs. Do not run that job on untrusted fork PRs.
Production requires secure cookies and HTTPS origins as enforced by environment validation.

## Payment operations and limitations

Register `/api/payments/webhook` with Stripe and configure STRIPE_WEBHOOK_SECRET.
Nest preserves raw bytes for signature verification. Missing configuration rejects
webhooks; missing or invalid signatures reject before payment lookup. Payment prices
come from owned, unexpired booking snapshots in USD. The legacy DTO amount is ignored.

Flight confirmation validates successful payment amount, currency and owner, writes
the active user's coordination revision, and atomically stores booking state and its
notification. Hotel confirmation continues to use its existing confirmation/sweep flow.
Payment webhooks no longer send a second generic booking-confirmed notification.

Cancellation amounts are derived from persisted booking cancellation records. Refund
jobs use deterministic IDs and provider idempotency keys. Failed requests stay recorded;
pending provider refunds are polled by the minute sweep. Successful refund notifications
are deduplicated. Jobs without a provider ID older than 23 hours require manual provider
reconciliation before any new request, avoiding blind retry after Stripe key expiry.
Do not mark pending refunds successful in UI. Review historical payment/refund duplicates
before deployment; existing records are not silently migrated.

References: [Nest raw body](https://docs.nestjs.com/faq/raw-body),
[Stripe signature verification](https://docs.stripe.com/webhooks/signature).

## Latest local evidence

On 2026-11-19, after the lockfile security update: `npm ci`, lint and build passed;
108 unit tests and 85 e2e tests passed; `npm audit --json` reported zero
vulnerabilities. The test runner emitted a MaxListeners warning during the combined
e2e process, but all suites completed. Hosted CI remains pending until this commit is pushed.
