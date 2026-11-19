# Reference dataset v3 (official course datasets)

The database is initialized from the **official reference datasets** linked in the project
description (section 5.1), which "will be used during the final project evaluation":
<https://docs.google.com/spreadsheets/d/1SlKUTRqlHuBJAMC-Z-QOZzSrzKpGHT_TgQUI5gVm-BA>
(sheets `Countries.csv`, `Cities.csv`, `Airports.csv`, `Attractions.csv`). Checked against
`src/reference-data/seed-data.ts` on 2026-11-19.

| Sheet | Rows | Seeded collection | Status |
|---|---|---|---|
| Airports.csv | 8 | `airports` | identical (CAI, DXB, LHR, JFK, CDG, HND, RUH, FRA) |
| Cities.csv | 8 | `cities` | identical ids; IANA `timeZone` taken from the airport rows |
| Countries.csv | 8 | `countries` | identical, including the `currency` column |
| Countries.csv `currency` | 7 distinct | `currencies` | EGP, AED, GBP, USD, EUR, JPY, SAR |
| Attractions.csv | 8 | `attractions` | identical ids `att-1` … `att-8` |

## Field mapping

- Airports: `iata_code` → `iataCode`, `name` → `name`, `city_id` → `city` (City.code),
  `country_code` → `country` (Country.code), `time_zone` → `timeZone`.
- Cities: `city_id` → `code` (kept exactly: `cairo`, `dubai`, `london`, `new_york`, `paris`,
  `tokyo`, `riyadh`, `frankfurt`), `name`, `country_code` → `country`.
- Countries: `code`, `name`, `currency` (ISO 4217).
- Currencies: exactly the distinct `currency` codes of Countries.csv ("the supported currencies
  are the currency codes listed in the Countries.csv"). Names and `minorUnits` follow ISO 4217
  (JPY has 0 minor units, the others 2).
- Attractions: `attraction_id` → `code`, `name`, `city_id` → `city`.

## Known data issue in the official sheet

`Attractions.csv` stores `att-8` as `R�merberg`: a character was lost when the sheet was
created. It is Frankfurt's Römerberg square, so the seed uses the correct spelling `Römerberg`
with the official id `att-8`.

## Seeding

`npm run seed:reference` validates time zones and that every airport/attraction city and every
country currency exists, then upserts by code (IATA code for airports). It never deletes
additional team data, and re-running it restores these entries.

Public, paginated (10 per page) read endpoints: `GET /api/reference/countries`, `/cities`,
`/airports`, `/currencies` and `/attractions?city=<city code>`. Currency data is not an
exchange-rate service; conversion uses FXRatesAPI (see `ITINERARIES.md`).
