// Maintained Triplify starter dataset v1, from John's supplied airport sheet.
// See docs/REFERENCE_DATA.md for field mapping, timezone provenance and coverage.
export const countries = [
  { code: 'EG', name: 'Egypt' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'FR', name: 'France' },
  { code: 'JP', name: 'Japan' },
  { code: 'SA', name: 'Saudi Arabia' },
];
export const cities = [
  { code: 'cairo', name: 'Cairo', country: 'EG', timeZone: 'Africa/Cairo' },
  { code: 'dubai', name: 'Dubai', country: 'AE', timeZone: 'Asia/Dubai' },
  { code: 'london', name: 'London', country: 'GB', timeZone: 'Europe/London' },
  { code: 'new_york', name: 'New York', country: 'US', timeZone: 'America/New_York' },
  { code: 'paris', name: 'Paris', country: 'FR', timeZone: 'Europe/Paris' },
  { code: 'tokyo', name: 'Tokyo', country: 'JP', timeZone: 'Asia/Tokyo' },
  { code: 'riyadh', name: 'Riyadh', country: 'SA', timeZone: 'Asia/Riyadh' },
];
export const airports = [
  {
    iataCode: 'CAI',
    name: 'Cairo International Airport',
    city: 'cairo',
    country: 'EG',
    timeZone: 'Africa/Cairo',
  },
  {
    iataCode: 'DXB',
    name: 'Dubai International Airport',
    city: 'dubai',
    country: 'AE',
    timeZone: 'Asia/Dubai',
  },
  {
    iataCode: 'LHR',
    name: 'Heathrow Airport',
    city: 'london',
    country: 'GB',
    timeZone: 'Europe/London',
  },
  {
    iataCode: 'JFK',
    name: 'John F. Kennedy International Airport',
    city: 'new_york',
    country: 'US',
    timeZone: 'America/New_York',
  },
  {
    iataCode: 'CDG',
    name: 'Charles de Gaulle Airport',
    city: 'paris',
    country: 'FR',
    timeZone: 'Europe/Paris',
  },
  { iataCode: 'HND', name: 'Haneda Airport', city: 'tokyo', country: 'JP', timeZone: 'Asia/Tokyo' },
  {
    iataCode: 'RUH',
    name: 'King Khalid International Airport',
    city: 'riyadh',
    country: 'SA',
    timeZone: 'Asia/Riyadh',
  },
];
export const currencies = [
  { code: 'USD', name: 'US Dollar', minorUnits: 2 },
  { code: 'EGP', name: 'Egyptian Pound', minorUnits: 2 },
];
