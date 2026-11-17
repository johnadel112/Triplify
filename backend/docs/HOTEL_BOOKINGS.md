# Hotel bookings and reviews (Youssef Ayman)

Requirements: HTL-16, HTL-17, HTL-18, HTL-20, HTL-21, HTL-23, HTL-24, shared GEN-11.
Code: `src/hotel-bookings/`. Tests: `src/hotel-bookings/stay-dates.spec.ts`,
`test/hotel-bookings.e2e-spec.ts`.

## Endpoints

| Method | Path | Req | Who |
|---|---|---|---|
| POST | `/api/hotel-bookings` | HTL-16, HTL-18 | USER |
| GET | `/api/hotel-bookings?group=UPCOMING\|PAST\|CANCELLED&page=` | HTL-20 | USER |
| GET | `/api/hotel-bookings/:id` | HTL-20, ACC-11 | owner or that hotel's moderator |
| POST | `/api/hotel-bookings/:id/confirm` | HTL-17 | owner |
| GET | `/api/hotel-bookings/:id/cancellation-quote` | HTL-21 | owner |
| POST | `/api/hotel-bookings/:id/cancel` body `{ "confirmation": true }` | HTL-21 | owner |
| POST | `/api/hotel-bookings/:id/review` body `{ rating, text? }` | HTL-23 | owner |
| PATCH / DELETE | `/api/reviews/:id` | HTL-23 | review author |
| GET | `/api/hotels/:id/reviews?page=` | HTL-24 | public |

All mutations need the team's CSRF headers (`Origin` + `X-Triplify-CSRF: 1`). Money is returned
as decimal strings in the platform currency (USD, PAY-04) and stored as integer cents.

## Lifecycle (GEN-11)

`PENDING_PAYMENT → CONFIRMED → COMPLETED`, `PENDING_PAYMENT → EXPIRED` (10-minute hold),
`CONFIRMED → CANCELLED` (user, before the check-in date).

1. **Hold (HTL-16/18).** One request reserves 1–10 rooms of one hotel for the same dates (1–30
   nights). Each room has its own adults (≥1) and children ages (0–17), checked against the
   room's max occupancy. The room must be active, inside an availability range and outside every
   blocked range for every night. Prices and the hotel policy are copied into the booking, so later
   price edits do not change it (HTL-05).
2. **Concurrency.** Inside one MongoDB transaction the booking and one `hotel_room_nights`
   document per (room, night) are inserted. A unique index on `{roomId, night}` means MongoDB
   rejects a second claim, so two concurrent requests cannot both hold a room for an overlapping
   night. Any duplicate aborts the whole transaction: no partial reservation survives
   (all-or-nothing). Claims of holds whose 10 minutes passed are released in the same
   transaction before inserting.
3. **Confirm (HTL-17).** The backend looks for a `SUCCEEDED` payment for the booking (set by the
   signature-verified Stripe webhook in PaymentsService) whose amount equals the booking total.
   In a transaction it checks that all claims are still owned, the user is ACTIVE (writing the
   user document so it serialises with account deactivation) and the hotel is active, then sets
   CONFIRMED, generates `HTL-XXXXXXXX` and sends an in-app notification. If the hold was lost, the
   booking becomes EXPIRED and the payment is refunded in full.
4. **Cancel (HTL-21).** Only CONFIRMED, only while today's hotel-local date is before the check-in
   date. `daysBefore` = days from today to check-in; the percentage comes from the booking's
   policy tiers via `RefundsService.calculateRefundPercentage`. The cancel and the room release are
   one transaction; the Stripe refund is issued by `RefundsService.processRefund` afterwards and
   its outcome stored in `cancellation.refundStatus`.
5. **Complete (HTL-23).** CONFIRMED becomes COMPLETED once the check-out instant (check-out date +
   check-out time in the hotel time zone) has passed.
6. **System sweep.** `HotelBookingLifecycle` runs every 60 s (`HOTEL_BOOKING_SWEEP_MS`, `0`
   disables; off in tests): confirms paid holds, refunds payments for expired holds, expires unpaid
   holds and completes stays. Reads also expire/complete lazily, so correctness does not depend on
   the timer.

## Reviews (HTL-23/24)

One review per COMPLETED reservation (unique index on `bookingId`), rating integer 1–5, optional
text ≤ 1000 characters. Public list: average (1 decimal) and count over visible reviews, newest
first, 10 per page. Reviews of deactivated accounts are shown as "Deleted user" (ACC-12).

## Integration points

| Teammate | What | How |
|---|---|---|
| Magdy (HTL-01..15) | hotel and room data | implement `HotelInventoryPort` (`hotel-inventory.port.ts`) and replace the `HOTEL_INVENTORY` provider in `hotel-bookings.module.ts` with `useExisting: <adapter>`. Until then hotel booking endpoints return 503 `INTEGRATION_UNAVAILABLE` (team convention). Ranges are nights: `from` inclusive, `to` exclusive. |
| Magdy | HTL-05/06 block/delete checks | `HotelBookingsService.hasActiveReservationsForRoom(roomId, from, to)` |
| Magdy | HTL-08 room status | `HotelBookingsService.getRoomNightClaims(roomIds, from, to)` (with reference) |
| Magdy | HTL-22 reservations view | `HotelBookingsService.findHotelReservations(actor, hotelId, page)` |
| Magdy | HTL-02 / HTL-12 rating | `ReviewsService.getRatingSummaries(hotelIds)` |
| Divan (PAY-01..03) | payment verification, refunds | reads the `Payment` collection (read-only); calls `RefundsService` |
| Divan (GEN-10) | hide/delete reported reviews | `ReviewsService.setHidden(id, hidden)`, `ReviewsService.deleteByModeration(id)` |
| John + Zeyad | `BOOKING_ACCESS` / `BOOKING_READER` | hotel halves: `hasUpcomingConfirmedBookings(userId, now, session)` and `findBookingSummaries(filters, limit)` (returns hotel total + first `limit` rows sorted by start desc, so the composite can merge before paginating). The composite adapter must be wired together with Zeyad's flight half. |

## Open issues for teammates (not changed here)

- `POST /api/payments` takes `amount` from the client. Confirmation rejects mismatching amounts,
  but PaymentsService should read the total from the booking.
- `GET /api/bookings/HOTEL/:id/policies` returns hardcoded policies; it should read the booking's
  `policy` snapshot.
- The Stripe webhook already sends a generic "Booking Confirmed!" notification, so users get two
  notifications (the hotel one carries the reference).
- CORS in `bootstrap.ts` does not allow `DELETE`, so browsers cannot call `DELETE /api/reviews/:id`
  (also affects blog deletes).
