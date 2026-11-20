# Optional bonus features

Implemented against the eight feature groups supplied on 2026-11-20, as authorized
by the team lead. This is the Milestone 1 backend scope; the frontend draft remains
on its separate branch. All paths below start with `/api`. Mutations retain the
existing trusted Origin and `X-Triplify-CSRF: 1` requirement.

## Email verification and recovery

- Registration queues a verification email. `POST /auth/request-verification`
  accepts `{ "email": "traveler@example.com" }` to resend (one per minute/account).
- `POST /auth/verify-email` accepts `{ "token": "<emailed token>" }`.
- `POST /auth/forgot-password` accepts an email and always returns the same generic
  response for eligible, missing, and ineligible accounts.
- `POST /auth/reset-password` accepts `token` and `newPassword`, enforcing the
  existing password policy. Reset invalidates all access/refresh sessions and clears
  login lockout. Ordinary password changes and admin resets invalidate recovery links.
- Tokens have 256 bits of randomness, are hashed on the user record, expire after
  24 hours (verification) or 30 minutes (recovery), and can be consumed only once.
  Resending replaces the previous token. These endpoints are rate-limited.
- Safe account responses include `emailVerified` and `emailNotifications`. Existing
  login/booking behavior remains available to unverified accounts; notification
  emails require verification. Verification and recovery emails do not require it.
- Emails link to the first configured `FRONTEND_URL` at `/verify-email#token=...`
  or `/reset-password#token=...`. The future frontend reads the fragment and submits
  the token in the API request body. For backend demos, use the token with Swagger.

## Email notifications

For hosts that block SMTP, set `MAIL_MODE=resend`, `RESEND_API_KEY`, and
`MAIL_FROM` to send through Resend's HTTPS API. The same encrypted queue, leases,
preferences, and retry rules apply. Each job supplies a stable provider idempotency
key (Resend retains keys for 24 hours). Provider errors never persist recipient
details or credentials. A successful API response means provider acceptance, not
confirmed inbox delivery. See [free deployment setup](DEPLOYMENT.md) for sender restrictions.

Set `MAIL_MODE=smtp`, `MAIL_FROM`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`,
`SMTP_PORT`, and `SMTP_SECURE` locally. SMTP requires TLS with certificate verification.
The default `MAIL_MODE=disabled` makes no network calls. No credentials are committed.

`PATCH /auth/email-notifications` with `{ "enabled": false }` opts out of optional
notification emails. Existing persisted in-app notifications are the durable source
for email delivery, including booking confirmations, cancellations, refunds and
flight-change notifications. Only verified accounts with notifications enabled are
queued, and preferences are checked again before sending a queued notification.
Administrative events enter through the existing notification dispatcher and then
follow the same email queue, including account and provider status changes.

The worker runs every minute, processing at most 100 source notifications and 100
mail jobs per run. Queue keys deduplicate notification jobs. Atomic two-minute leases
prevent concurrent workers from normally delivering the same job. Failures retry with
exponential backoff, up to eight attempts; inspect `mailjobs` for `FAILED` jobs.
Payloads are encrypted using AES-256-GCM with a key derived from `JWT_ACCESS_SECRET`,
omitted from ordinary database projections, and erased on success. Do not rotate that
secret while expecting old queued mail to remain decryptable. Expired jobs are removed
by MongoDB TTL. SMTP is at-least-once: a crash after SMTP acceptance but before the DB
update can cause a duplicate; stable Message-ID assists recipient-side deduplication.

## Flight changes and seat selection

- Airline moderators configure `PUT /flights/:id/seat-map` with
  `{ "cabinClass": "economy", "seats": ["1A", "1B"] }`. The map must match the
  cabin capacity; configuring it is blocked while a hold or confirmed booking exists.
- Travelers use `GET /flight-bookings/:id/seat-map/:legIndex` (zero-based index)
  and `PUT /flight-bookings/:id/seats` with `{ "legIndex": 0, "seats": ["1A"] }`.
  Seat order follows non-infant passenger order. Each such passenger requires one
  distinct seat. Only active holds and upcoming confirmed bookings can select seats.
- Seat selection is free and optional. Inventory and seat assignments are separate;
  selection does not reserve an extra seat. Transactions serialize competing requests.
  Traveler/provider cancellation, expiry and flight changes release assignments. E-tickets include seats.
- `PATCH /flight-bookings/:id/change` takes `legs` with `flightId` and `cabinClass`.
  Changes are limited to upcoming confirmed bookings, preserving leg count, airline,
  route, cabin, purchased baggage terms and the exact fare including baggage. A different fare requires a new
  booking. Original payment totals and cancellation policy remain unchanged. Old seat
  choices are cleared; travelers select seats on the replacement flights.
- Replacement inventory, booking updates and the change notification commit together.
  A failed replacement leaves the original booking and inventory intact.

## Hotel moderator replies

`PUT /reviews/:id/reply` with `{ "text": "Thank you for staying with us." }` creates
or replaces one hotel reply (1–2,000 characters). `DELETE` at the same path removes it.
Only the moderator of the assigned active, verified hotel may reply. Hidden reviews
cannot receive replies. Public review listings include `moderatorReply` or `null`.

## Booking attachments and itinerary PDF export

`POST /itineraries/:id/bookings` accepts `type` (`FLIGHT` or `HOTEL`) and `bookingId`.
Both itinerary and confirmed booking must belong to the caller. Repeated attachment
is idempotent. `GET` lists safe booking summaries with their current status; later
cancellations are visible. `DELETE /itineraries/:id/bookings/:attachmentId` detaches.

Attachments are separate private records: they do not appear in public itineraries,
public search, blog posts or cloned itineraries. Even a public itinerary's attachment
list is owner-only. `GET /itineraries/:id/export.pdf` downloads an owner-only PDF with
days, activities, budgets, intercity transport and attached booking summaries. It
omits passports and payment credentials. Amounts retain their original currencies;
export does not call the FX service or sum different currencies. The default PDF font
supports Western text; other scripts require a suitable embedded font in a later UI pass.

## Blog itinerary attachments

`PUT /blog/posts/:id/itinerary` accepts `itineraryId`. Both resources must belong to
the traveler and the itinerary must be public and not hidden. `DELETE` removes the
link. Post views include only itinerary ID/title. Every read rechecks visibility;
private, hidden or deleted itineraries are represented as `null`, with no booking data.

## Administrator analytics and favourites

`GET /admin/analytics` is admin-only. It returns all-time resource counts, flight and
hotel booking counts by status, favourites by type, and successful payments minus
successful refunds grouped by currency. No exchange conversion or private user data
is included. Counts are a live operational overview, not a transactionally frozen report.

Travelers use `POST /favourites` with `type` (`HOTEL`, `FLIGHT`, `ITINERARY`, `BLOG_POST`)
and `targetId`, `GET /favourites?page=1`, and `DELETE /favourites/:id`. Add is idempotent.
Only public/available resources may be added. Lists contain ten entries per page and
recheck resource visibility; unavailable targets are `null` and can still be removed.

## Validation

`test/bonus.e2e-spec.ts` uses a disposable MongoDB replica set and captured SMTP
transport to exercise token expiry/replay, session revocation, delivery retries,
privacy, ownership, PDF bytes, analytics arithmetic, seat contention, inventory rollback,
and competing changes for a final seat. No live SMTP delivery or cloud deployment is
claimed by these tests. Use the existing lint/build/unit/e2e commands for the full gate.

Library references: [Nodemailer SMTP](https://nodemailer.com/smtp) and
[PDFKit documents](https://pdfkit.org/docs/getting_started.html).

Verified on 2026-11-20 after integrating `origin/main` at `5343a1a`: build/lint passed,
121 unit tests and 138 end-to-end tests passed (including 18 bonus tests). Swagger
covers 162 operations. The dependency installation audit reported no vulnerabilities.
