# Team integration contract

The production default implementations in `src/integrations/integrations.module.ts` throw HTTP 503 `INTEGRATION_UNAVAILABLE`. They never synthesize bookings, accept arbitrary provider IDs, or treat outages as an absence of bookings. Tests override Nest tokens only inside the testing module. Replace the defaults with exported real adapters after importing the owning modules. The application uses one MongoDB connection and transactions; Atlas or another replica set is required.

## Zeyad: flight bookings; Youssef: hotel reservations

Implement the `BOOKING_ACCESS` and `BOOKING_READER` interfaces in `src/integrations/contracts.ts`, typically with a composite adapter that calls both owning services. Preserve ownership in your existing collections.

- `hasUpcomingConfirmedBookings(userId, now, transaction)` must check both sources and return true if either contains a CONFIRMED future booking. Hotel: check-out instant > now, including an already-started stay. Flight: any uncompleted segment departure > now. Store/query UTC instants; convert hotel local dates using the property's IANA timezone. Cancellation/completion is nonblocking. Propagate unavailable/failed queries as 503.
- This method and **every new booking confirmation** must serialize through the same user's document in the supplied transaction (a dedicated booking coordination revision increment is suitable). Confirmations must check ACTIVE status and write that coordination revision. Merely reading bookings before deactivating leaves a race. The current account update then conflicts with concurrent booking confirmations. Do not certify this integration until a two-transaction race test passes.
- `findBookings(filters)` returns the normalized `BookingSummary` in source, with reference, type, safe user/provider identity, UTC dates, decimal-string amount and currency, and normalized status. Map source statuses explicitly to PENDING/CONFIRMED/CANCELLED/COMPLETED. Admin endpoint is read-only; no cancellation/payment mutations.
- Filter type/status; inclusive `startDate` lower bound and `endDate` upper bound on the relevant booking start instant. Date-only values mean UTC midnight. For an entire day, frontend must send the final instant of that day or next-day logic according to an agreed adapter update. Sort combined results by startDate descending, then type/reference for ties; aggregate total across both sources **before** taking the requested 10-row page. Do not merge two independently paginated pages. No fake totals.

## Yassin and Magdy: providers

Confirm your team's actual hotel/airline ownership mapping; this code does not assume which developer owns which provider type. Implement `PROVIDER_MANAGEMENT` against the real source collections:

- `verifyProvider(type,id,transaction)` checks existence and type; malformed IDs already fail DTO validation. Serialize against deletion/reassignment as needed. No provider may be hard-deleted while referenced by a moderator.
- `setProviderActive(type,id,active,transaction)` must actually persist state, reject missing providers/invalid transitions, and participate in the same transaction as audit/outbox writes. Returning without persistence violates the contract. External providers on another database need a designed saga/outbox integration before replacing this transaction-bound interface.
- Active searches exclude inactive providers. New booking confirmation must check and serialize against provider state, so a concurrent deactivation cannot accept a new booking. Existing CONFIRMED bookings remain valid. Reactivation restores eligibility subject to other booking rules. Provider suspension and moderator suspension are independent.

## Shared authorization

Global guards protect every controller unless explicitly decorated `@Public()`. `JwtAuthGuard` reads authoritative role/status/provider assignment and a live persistent session. `@Roles(UserRole.ADMIN)` restricts admin controllers. `@CurrentUser()` supplies a server-generated `Principal`; never construct it from client IDs/roles. Only auth/me, logout, refresh and own password-change can operate while `mustChangePassword` is true.

Use `AccessPolicy` from `src/common/policies.ts` in the service/query layer:

```ts
const filter = policy.bookingQuery(actor, isAdministrativeRead);
const booking = await actualBookingModel.findOne({ _id: validatedId, ...filter });
// No record: 404. Never fetch/return an unscoped private record first.
policy.ownerOrAdmin(actor, itinerary.ownerId.toString());
policy.providerScope(actor, 'HOTEL', booking.hotelId.toString());
```

`isAdministrativeRead` is a backend constant on an explicitly admin-guarded route, never a client query field. Private itineraries default to owner-only. Admin booking oversight explicitly opts in. Moderator query scope includes both provider ID and type. Ordinary users cannot change their assignment, role or status. Authenticated DTO bodies reject extra fields.

## Blog/itinerary visibility

Read account status when serving public content, or reliably invalidate caches on state changes. `AccessPolicy.contentVisibility` hides posts/public itineraries for DEACTIVATED authors and returns `Deleted user` for comment/review attribution. SUSPENDED users' content remains visible unless separately moderated. Preserve bookings/financial history. Do not erase content or booking documents in the account service. Actual rendering/query integration remains with those owners.

## Notifications and audit

Account/provider state changes atomically store an audit record plus a `NotificationOutbox` event. Responses explicitly say `PENDING_INTEGRATION`; no delivery is claimed. The future notification developer implements `NotificationDeliveryPort.deliver(AdminNotificationEvent)`, consumes pending events, routes account events to the target account and provider events to affected moderators/parties, and marks DELIVERED only after success. Deduplicate by eventId, retry with backoff, and use an atomic claim/lease for concurrent consumers. Do not run a no-op consumer. Outbox contains no credentials. Audit collections have no public CRUD endpoint; restrict database write permissions operationally. Password resets/moderator creation are audited without passwords.

## Frontend

Use fetch `{credentials:'include'}`. Every POST/PATCH requires `X-Triplify-CSRF: 1` and a browser Origin matching configured exact frontend origins, including registration/login. Cookies are HttpOnly; never put tokens in JS storage. Serialize refresh requests across tabs (BroadcastChannel/Web Locks), because duplicate refresh requests intentionally revoke the session. On 401 `AUTHENTICATION_REQUIRED`, redirect to login and preserve only an allowlisted local route; reject protocol-relative `//`, schemes, backslashes and external URLs. Server `routeHint` is a convenience, not authorization. Show `PASSWORD_CHANGE_REQUIRED` flow before normal app actions. Password change revokes **all** sessions and requires login again.

## Integration acceptance still required

Run tests against actual hotel/flight/provider modules for blocking bookings, new-booking races, provider visibility/eligibility, aggregate pagination and notification delivery. Existing contract tests use isolated test mocks; they do not certify teammate code.
