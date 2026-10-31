# API contract

All paths below start with `/api`. JSON input uses strict DTO validation; additional fields produce 400. Dates are ISO 8601; IDs are MongoDB ObjectId strings. Errors contain `statusCode`, `code`, `message`; validation adds `fields: [{field,messages}]`. Safe response schemas and request DTOs are in development Swagger `/api/docs` and `/api/docs-json`.

Every mutation requires exact allowlisted Origin and `X-Triplify-CSRF: 1`. Browser calls include credentials. Authenticated routes use HttpOnly access cookies; refresh uses its HttpOnly refresh cookie. All responses are no-store. Guest routes remain callable by authenticated users.

| Method | Path                                     | Access                                            | Body/query                                          |
| ------ | ---------------------------------------- | ------------------------------------------------- | --------------------------------------------------- |
| POST   | /auth/register                           | Guest                                             | name, email, password, consent:true                 |
| POST   | /auth/login                              | Guest                                             | email, password                                     |
| POST   | /auth/logout                             | Authenticated, including mandatory-change session | none                                                |
| POST   | /auth/refresh                            | Valid refresh session                             | none                                                |
| GET    | /auth/me                                 | Authenticated, including mandatory-change session | none                                                |
| GET    | /users/me                                | Authenticated                                     | none                                                |
| PATCH  | /users/me                                | Authenticated                                     | optional name, phoneNumber, preferredCurrency       |
| PATCH  | /users/me/password                       | Authenticated, including mandatory-change session | currentPassword, newPassword                        |
| POST   | /users/me/deactivate                     | USER                                              | confirmation:true                                   |
| GET    | /admin/users                             | ADMIN                                             | search, role, status, page (default 1; size 10)     |
| PATCH  | /admin/users/:id/suspend                 | ADMIN                                             | none                                                |
| PATCH  | /admin/users/:id/reactivate              | ADMIN                                             | none                                                |
| POST   | /admin/users/:id/reset-password          | ADMIN                                             | none; returns generated temporaryPassword once      |
| POST   | /admin/moderators                        | ADMIN                                             | name, email, password (temporary), role, providerId |
| PATCH  | /admin/moderators/:id/suspend            | ADMIN                                             | none                                                |
| PATCH  | /admin/moderators/:id/reactivate         | ADMIN                                             | none                                                |
| PATCH  | /admin/providers/hotels/:id/deactivate   | ADMIN                                             | none                                                |
| PATCH  | /admin/providers/hotels/:id/reactivate   | ADMIN                                             | none                                                |
| PATCH  | /admin/providers/airlines/:id/deactivate | ADMIN                                             | none                                                |
| PATCH  | /admin/providers/airlines/:id/reactivate | ADMIN                                             | none                                                |
| GET    | /admin/bookings                          | ADMIN                                             | type, status, startDate, endDate, page              |
| GET    | /reference/countries                     | Public                                            | page, search, country                               |
| GET    | /reference/cities                        | Public                                            | page, search, country                               |
| GET    | /reference/airports                      | Public                                            | page, search, country                               |
| GET    | /reference/currencies                    | Public                                            | page, search                                        |
| GET    | /health                                  | Public                                            | none                                                |

Roles: USER, ADMIN, HOTEL_MODERATOR, AIRLINE_MODERATOR. Statuses: ACTIVE, SUSPENDED, DEACTIVATED. Moderator creation accepts only the two moderator roles, derives provider type from role and verifies the actual provider. Account lists return only id/name/email/role/status/createdAt. Profiles additionally return phone/currency, provider assignment and mustChangePassword, never credentials or session metadata. Login returns `{user,routeHint}` and Set-Cookie headers, never bearer tokens in JSON. Logout/refresh return `{success:true}`; password change additionally returns `reauthenticate:true`.

Registration/moderator creation/password reset return 201. Other successful operations return 200. Account and provider transitions return `notificationStatus: PENDING_INTEGRATION` until an actual notification worker is connected. Deactivation/moderator creation/provider changes/admin booking retrieval return 503 with default missing adapters; no fake success is available. The admin endpoint does not reset admin passwords or reactivate DEACTIVATED users.

Pagination response: `{items,total,page,pageCount}` with fixed size 10 and page in 1..100000. Empty results have pageCount 0. Search strings are escaped literal case-insensitive matches, never arbitrary MongoDB operators. Booking dates/status mapping and combined sorting are defined in TEAM_INTEGRATION.md.
