# Maintained starter dataset v1

This repository uses John's seven-airport spreadsheet supplied in chat: CAI, DXB, LHR, JFK, CDG, HND and RUH. It seeds the seven corresponding countries and cities. Supported currencies currently remain EGP and USD; the sheet supplied no currency list. This is not a worldwide airport/currency catalog. John owns additions and review.

Source column mapping: `iata_code` → API/schema `iataCode`, `name` → `name`, `city_id` → `city` (references City.code), `country_code` → `country` (references Country.code). The supplied city IDs are preserved exactly: `cairo`, `dubai`, `london`, `new_york`, `paris`, `tokyo`, `riyadh`. These are internal identifiers, not claimed ISO city codes. IANA `timeZone` is added to each city/airport.

Provenance checked 2026-10-31:

- Airport codes/names/city/country associations: user's supplied spreadsheet screenshot, 2026-10-31. Additional cross-checks for [CAI](https://ourairports.com/airports/HECA/) and [JFK](https://ourairports.com/airports/KJFK/) from OurAirports, which publishes public-domain data at https://ourairports.com/data/.
- Time zones and country codes: [IANA zone1970.tab](https://data.iana.org/time-zones/tzdb/zone1970.tab); `Africa/Cairo`, `Asia/Dubai`, `Europe/London`, `America/New_York`, `Europe/Paris`, `Asia/Tokyo`, `Asia/Riyadh`. Never use fixed UTC offsets.
- Currency designations: [SIX ISO 4217 maintenance agency](https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html), [current XML list](https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml). XML was not retrievable by the browsing tool; this is an explicitly maintained subset, not an automated import.

`npm run seed:reference` upserts by country/city/currency code and airport IATA code, validates time-zone support, and does not delete additional team data. Re-running it restores maintained entries to this version. All reference endpoints paginate at 10; continue to `pageCount` to populate selects. Default profile currency is USD; seed references before serving registration/profile forms. Currency data is not an exchange-rate service.
