# Itineraries, Budgeting and Public Sharing Module

**Author**: Mohamed Essam Elsadany (`MElsadany2165`)  
**Assigned Requirements**: `ITN-01`, `ITN-03`, `ITN-05`, `ITN-07`, `ITN-08`, `ITN-09`, `ITN-10`, `ITN-12`, `ITN-14`, `ITN-16`, `ITN-18`, `ITN-20`, `ITN-21`, `ITN-25`, `ITN-26`, and `GEN-08`  
**Milestone**: Milestone 1 (Backend & REST API)

---

## 1. Architectural Overview & Domain Design

The Itineraries module follows the project's Model-View-Controller (MVC) architecture with NestJS and MongoDB. All itinerary days, activities, budget items, and intercity transport entries are modeled as bounded subdocuments inside the parent `Itinerary` document. This ensures transactional atomicity when recalculating dates, renumbering days, reordering stays, and deep-cloning public itineraries.

### Domain Entities
- **Itinerary**: Main document owned by a registered traveler (`userId`), containing title (<= 100 characters), countries array, start date (`YYYY-MM-DD`), description, public/private visibility flag (`isPublic`), ordered days, intercity transport costs, and optional `clonedFrom` attribution.
- **ItineraryDay**: Sequential day (`dayNumber: 1..N`) with derived calendar `date`, predefined `cityCode` (validated against reference data `City`), cached `cityName`, optional `theme`, nested `activities`, and nested `budgets`.
- **Activity**: Activity with title, description, time, location, optional local cost and currency, and an array of validated `ActivityImage` objects (GEN-08).
- **DayBudget**: Daily expense allocation categorized into `FOOD`, `ACCOMMODATION`, `IN_CITY_TRANSPORT`, or `ACTIVITIES` with amount and 3-letter currency code.
- **IntercityTransportCost**: Legs connecting cities (`FLIGHT`, `TRAIN`, `BUS`, `CAR`, `FERRY`, `OTHER`) with departure date, cost, currency, and booking reference.
- **ClonedAttribution**: Attribution metadata for cloned public itineraries referencing source `itineraryId`, `originalAuthorId`, `originalAuthorName`, and `clonedAt`.

---

## 2. Implemented REST Endpoints (Section 8.8)

| Method | Endpoint | Requirement | Description |
|---|---|---|---|
| `POST` | `/api/itineraries` | ITN-01 | Create itinerary with required title (<= 100 chars), countries, and start date |
| `GET` | `/api/itineraries` | ITN-03 | List current user's itineraries with computed day counts and city groups |
| `GET` | `/api/itineraries/:id` | ITN-03 | Get itinerary details (ownership enforced for private itineraries) |
| `PATCH` | `/api/itineraries/:id` | ITN-01, ITN-20 | Update itinerary title, description, countries, start date, or visibility |
| `DELETE` | `/api/itineraries/:id` | ITN-01 | Delete itinerary and all nested days, activities, budgets, and costs |
| `POST` | `/api/itineraries/:id/days` | ITN-05 | Add day; automatically renumbers days (1..N) and recalculates calendar dates |
| `PATCH` | `/api/itineraries/:id/days/:dayId` | ITN-05 | Edit itinerary day (predefined city, theme) |
| `DELETE` | `/api/itineraries/:id/days/:dayId` | ITN-07 | Delete day; automatically renumbers subsequent days and recalculates dates |
| `PATCH` | `/api/itineraries/:id/days/reorder` | ITN-08 | Reorder days given `dayIds: string[]`; renumbers 1..N and recalculates dates |
| `POST` | `/api/itineraries/:id/days/:dayId/activities` | ITN-10 | Add activity to day |
| `PATCH` | `/api/activities/:id` | ITN-10 | Edit activity details |
| `DELETE` | `/api/activities/:id` | ITN-10 | Delete activity |
| `POST` | `/api/activities/:id/images` | ITN-12, GEN-08 | Upload activity images (JPEG, PNG, WebP; <= 5MB; max 5 images per activity) |
| `DELETE` | `/api/activities/:id/images/:imageId` | ITN-12 | Delete activity image |
| `POST` | `/api/itineraries/:id/days/:dayId/budgets` | ITN-14 | Add daily budget entry (food, accommodation, local transport, activities) |
| `PATCH` | `/api/budgets/:id` | ITN-14 | Edit daily budget entry |
| `DELETE` | `/api/budgets/:id` | ITN-14 | Delete daily budget entry |
| `POST` | `/api/itineraries/:id/transport-costs` | ITN-16 | Add intercity transport cost entry |
| `PATCH` | `/api/transport-costs/:id` | ITN-16 | Edit intercity transport cost entry |
| `DELETE` | `/api/transport-costs/:id` | ITN-16 | Delete intercity transport cost entry |
| `GET` | `/api/itineraries/:id/budget-summary` | ITN-14, ITN-18 | Subtotals by category/day + FXRatesAPI conversion to user preferred currency |
| `GET` | `/api/itineraries/public/search` | ITN-20, ITN-21 | Search public itineraries by keyword, country, city, and min/max day count |
| `GET` | `/api/itineraries/public/:id` | ITN-21 | View public itinerary details (accessible to guests and users) |
| `POST` | `/api/itineraries/:id/clone` | ITN-21 | Clone public itinerary into an independent private copy preserving attribution |
| `GET` | `/api/itineraries/:id/hotels` | ITN-25 | Reuse hotel search parameters for consecutive city stays |
| `GET` | `/api/itineraries/:id/flights` | ITN-26 | Reuse flight search parameters for trip start, return, and intercity hops |

---

## 3. Core Algorithms & Implementation Details

### Day Renumbering & Calendar Date Recalculation (ITN-05, ITN-07, ITN-08)
Calendar dates are derived from `itinerary.startDate` and each day's ordinal position:
$$\text{date}_i = \text{addDays}(\text{startDate}, i - 1)$$
Whenever days are inserted, deleted, or reordered:
1. `itinerary.days` is sorted into the new sequence.
2. Every day is assigned `dayNumber = i + 1`.
3. Every day's date is recalculated using UTC calendar arithmetic to prevent daylight saving time discrepancies.

### Consecutive City Grouping (ITN-09, ITN-25)
Consecutive days associated with the same predefined city are dynamically collapsed into cohesive stays:
- `startDay` and `endDay`: span of consecutive days in that city.
- `checkInDate`: first day's date.
- `checkOutDate`: day after the final day in that city ($+1$ day).
- `nights`: $\text{endDay} - \text{startDay} + 1$.
- `searchQuery`: Pre-populated hotel search query parameters (`destination`, `checkIn`, `checkOut`, `guests`).

### FXRatesAPI Integration & Budget Conversion (ITN-18)
The backend integrates with `https://api.fxratesapi.com/latest`:
- **Caching**: Live rates against `USD` are cached in memory for 1 hour to prevent API rate exhaustion.
- **Graceful Fallback**: If FXRatesAPI is unreachable or offline, the service falls back to a curated exchange-rate matrix covering major global currencies (`USD`, `EUR`, `GBP`, `EGP`, `AED`, `SAR`, etc.).
- **Conversion Formula**:
$$\text{amount}_{\text{target}} = \frac{\text{amount}_{\text{source}}}{\text{rate}_{\text{source/USD}}} \times \text{rate}_{\text{target/USD}}$$
- **User Preference**: Budget summary automatically retrieves the user's `preferredCurrency` (John's module) if none is explicitly specified in the query parameter.

### Public Itinerary Cloning with Attribution (ITN-21)
When a registered user clones a public itinerary:
1. Validates that `source.isPublic === true` (private itineraries cannot be cloned).
2. Deep-copies all days, activities, budget items, and transport costs with newly generated MongoDB `ObjectId`s.
3. Sets `isPublic = false` (private independent copy for the cloner).
4. Records attribution:
   - `clonedFrom.itineraryId`: original source ID.
   - `clonedFrom.originalAuthorId`: author user ID.
   - `clonedFrom.originalAuthorName`: original creator's name.
   - `clonedFrom.clonedAt`: timestamp.

---

## 4. Testing & Verification

Comprehensive automated test suites cover all 15 requirements:
- `src/itineraries/itineraries.domain.spec.ts`: Pure unit tests for UTC calendar date arithmetic, sequential renumbering across month/leap year boundaries, and consecutive city grouping.
- `src/itineraries/itineraries.spec.ts`: End-to-end service and mock validation testing creation limits, ownership enforcement, reordering, GEN-08 image upload limits, FXRates currency conversions, public search filtering, and public cloning attribution.

Run tests:
```bash
npm --prefix backend test -- src/itineraries/
```
