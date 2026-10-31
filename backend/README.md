# Triplify backend

NestJS/TypeScript, MongoDB/Mongoose, bcrypt, JWT access cookies and rotating opaque refresh cookies. Scope: John's accounts/admin foundation. Missing teammate integrations fail closed with 503; notification events persist pending delivery. Email verification, SMTP, public email reset and analytics are intentionally excluded.

## Run locally

Use Node 22+ and npm. In Windows PowerShell use `npm.cmd` if execution policy blocks `npm.ps1`.

```powershell
cd backend
npm.cmd ci
Copy-Item .env.example .env
# Edit .env with your own protected settings, then:
npm.cmd run seed:reference
npm.cmd run seed:admin
npm.cmd run start:dev
```

Configure MongoDB Atlas: create a cluster/database `triplify`; create a database user limited to that database, allow your development IP (and the deployment's egress IP), and copy Atlas's Drivers connection URI into `MONGODB_URI` with the database name. URL-encode password special characters. Keep TLS enabled. Transactions require a replica set; Atlas supports this, a standalone local mongod does not. No real Atlas credentials were provided or provisioned by this implementation.

Set `JWT_ACCESS_SECRET` to at least 32 random characters; generate locally, for example `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Set `FRONTEND_URL` to exact comma-separated origins, without paths/trailing slashes/wildcards. `PORT` defaults to 3000. `.env` is ignored by Git. Do not paste secrets into issues or CI logs.

For initial admin provisioning set `ADMIN_SEED_EMAIL`, `ADMIN_SEED_NAME`, `ADMIN_SEED_PASSWORD` in the protected environment. Admin seed passwords require 12–72 printable ASCII characters including letter/digit. Seeding never promotes an existing non-admin or overwrites an existing admin password. Remove seed credentials from runtime environment after provisioning. Logged-in admins rotate their own credentials with the ordinary current-password change endpoint; lost-admin recovery requires a separately reviewed privileged database maintenance procedure, not repeated seeding or a public reset endpoint.

```text
npm run build       # dist/src/main.js
npm start
npm run lint
npm test            # isolated policies/config tests
npm run test:e2e    # real disposable MongoDB replica set + Supertest; external ports mocked
```

E2E tests download MongoDB 7.0.24 on first run and require network access and local process execution. They never connect to Atlas; they supply their own URI. Run tests without production credentials. Swagger: http://localhost:3000/api/docs (development/test only), JSON: `/api/docs-json`. Health: `/api/health` is liveness, not a database readiness guarantee.

MongoDB binary downloads are disabled during dependency installation and deferred to test execution. To use an already-installed executable for a disposable test replica set instead of downloading one:

```powershell
$env:MONGOMS_SYSTEM_BINARY='C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe'
$env:MONGOMS_VERSION='8.2.6' # must match your installed executable
npm.cmd run test:e2e
```

This launches separate temporary database files/processes; it does not connect to an existing local MongoDB service. The development-only Prettier dependency supports `npm run format` for consistent source formatting.

## Security and session semantics

- Access JWT: HS256, issuer/audience checked, 10-minute lifetime. Refresh: 256-bit random opaque credential, 7-day absolute server session limit; only SHA-256 hash persisted. An opaque refresh token does not need `JWT_REFRESH_SECRET`.
- Every authenticated request loads current account data and atomically updates `lastActivityAt` only for non-revoked sessions with matching account authVersion, future expiry and activity strictly newer than now minus 30 minutes. Exactly 30 idle minutes expires the session. `$max` prevents concurrent activity from moving time backward. Refresh also counts as authentication. Use synchronized clocks on application hosts.
- Refresh rotation uses compare-and-swap. Any replay or concurrent duplicate revokes that session; clients must serialize refresh. A lost rotation response requires fresh login. Absolute expiry never extends, even though each refreshed browser cookie gets a new Max-Age.
- Suspension/deactivation/reset/password change increment account authVersion and revoke sessions transactionally. A login racing revocation may issue a cookie but cannot authorize with its stale version. Already-authorized in-flight reads can finish; critical mutations recheck state/version in their transaction.
- Login lockout: five consecutive failures, 15 minutes. Compare-and-swap avoids lost counts. After expiry a wrong password starts a new failure sequence; a correct password clears lock and counter. Bcrypt cost 12, passwords restricted to 8–72 printable ASCII characters to prevent bcrypt byte truncation; letter and digit required.
- Production requires `COOKIE_SECURE=true` and HTTPS origins. Cookies are HttpOnly, `SameSite=lax` default, access Path `/api`, refresh Path `/api/auth`. Use `SameSite=none` only for truly cross-site deployments with Secure; prefer same-site hosting. Leave COOKIE_DOMAIN empty for host-only cookies unless deliberate subdomain sharing is needed.
- CSRF: all mutations, including login, require exact trusted Origin plus custom `X-Triplify-CSRF: 1`; browser preflight/CORS blocks foreign origins. CLI clients must provide both explicitly. No token is stored in browser JS storage. Swagger requests need the same headers and an allowed origin; add the API origin only in development if using Swagger's Try It Out.
- Rate limiting is in-process (20 login attempts/minute/IP, 10 registrations/minute/IP, global 120/minute/IP). Deploy a single process or supply a shared throttler storage and edge limits before horizontal scaling. Do not blindly trust proxy headers; configure exact trusted proxy hops in the deployment before relying on per-client IP limits.
- Safe logs contain method/route template/duration only. Errors do not expose stack traces or database internals. Responses use allowlisted account projections. Audit/outbox omit secrets. Index creation is awaited before startup; for larger production collections use controlled index migrations instead of autoIndex.
- Generated admin reset passwords are returned once with `Cache-Control: no-store`; admins must deliver over a verified secure channel, never email/chat logs. Delivery itself is outside this backend. The server cannot display an old temporary password again; reset again if lost. Moderator creation accepts an admin-supplied temporary password and never echoes it. Neither temporary workflow automatically expires the password; require prompt delivery/use and reset if compromised.

See [API](docs/API.md), [integration contracts](docs/TEAM_INTEGRATION.md), [seed provenance](docs/REFERENCE_DATA.md), and [coverage/limitations](docs/DELIVERY.md).
