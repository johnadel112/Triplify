// Triplify reference dataset v3: the official course datasets (Countries, Cities, Airports,
// Attractions .csv). See docs/REFERENCE_DATA.md for field mapping and provenance.
export const countries = [
  { code: 'EG', name: 'Egypt', currency: 'EGP' },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP' },
  { code: 'US', name: 'United States', currency: 'USD' },
  { code: 'FR', name: 'France', currency: 'EUR' },
  { code: 'DE', name: 'Germany', currency: 'EUR' },
  { code: 'JP', name: 'Japan', currency: 'JPY' },
  { code: 'SA', name: 'Saudi Arabia', currency: 'SAR' },
];
export const cities = [
  { code: 'cairo', name: 'Cairo', country: 'EG', timeZone: 'Africa/Cairo' },
  { code: 'dubai', name: 'Dubai', country: 'AE', timeZone: 'Asia/Dubai' },
  { code: 'london', name: 'London', country: 'GB', timeZone: 'Europe/London' },
  { code: 'new_york', name: 'New York', country: 'US', timeZone: 'America/New_York' },
  { code: 'paris', name: 'Paris', country: 'FR', timeZone: 'Europe/Paris' },
  { code: 'tokyo', name: 'Tokyo', country: 'JP', timeZone: 'Asia/Tokyo' },
  { code: 'riyadh', name: 'Riyadh', country: 'SA', timeZone: 'Asia/Riyadh' },
  { code: 'frankfurt', name: 'Frankfurt', country: 'DE', timeZone: 'Europe/Berlin' },
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
  {
    iataCode: 'FRA',
    name: 'Frankfurt Airport',
    city: 'frankfurt',
    country: 'DE',
    timeZone: 'Europe/Berlin',
  },
];
// Supported currencies are exactly the currency codes in the official Countries.csv.
// Names and minor units follow ISO 4217.
export const currencies = [
  { code: 'USD', name: 'US Dollar', minorUnits: 2 },
  { code: 'EGP', name: 'Egyptian Pound', minorUnits: 2 },
  { code: 'AED', name: 'UAE Dirham', minorUnits: 2 },
  { code: 'GBP', name: 'Pound Sterling', minorUnits: 2 },
  { code: 'EUR', name: 'Euro', minorUnits: 2 },
  { code: 'JPY', name: 'Japanese Yen', minorUnits: 0 },
  { code: 'SAR', name: 'Saudi Riyal', minorUnits: 2 },
];
// Official Attractions.csv. The sheet stores att-8 with a lost character (U+FFFD); it is
// Frankfurt's Roemerberg square, so the corrected spelling is used with the official id.
export const attractions = [
  { code: 'att-1', name: 'Giza Pyramids and Sphinx', city: 'cairo' },
  { code: 'att-2', name: 'Burj Khalifa Observation Deck', city: 'dubai' },
  { code: 'att-3', name: 'British Museum', city: 'london' },
  { code: 'att-4', name: 'Central Park', city: 'new_york' },
  { code: 'att-5', name: 'Louvre Museum', city: 'paris' },
  { code: 'att-6', name: 'Senso-ji Temple', city: 'tokyo' },
  { code: 'att-7', name: 'Kingdom Centre Tower (Sky Bridge)', city: 'riyadh' },
  { code: 'att-8', name: 'Römerberg', city: 'frankfurt' },
];
