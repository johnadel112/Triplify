import { ClientSession } from 'mongoose';
import { FlightBookingSummariesService } from '../flight-bookings/flight-booking-summaries.service';
import { HotelBookingsService } from '../hotel-bookings/hotel-bookings.service';
import { BookingsCompositeAdapter } from './bookings.adapter';
import { BookingSummary } from './contracts';

const row = (type: 'FLIGHT' | 'HOTEL', reference: string, day: number): BookingSummary => ({
  reference,
  type,
  user: { id: 'u', name: 'User' },
  provider: { id: 'p', name: 'Provider' },
  startDate: new Date(Date.UTC(2026, 11, day)).toISOString(),
  amount: { value: '10.00', currency: 'USD' },
  status: 'CONFIRMED',
});

/** Simulates a source that returns its newest-first rows, cut to `limit`, plus its total. */
const source = (rows: BookingSummary[]) =>
  jest.fn((...args: unknown[]) => {
    const limit = args.find((a) => typeof a === 'number') as number;
    const sorted = [...rows].sort((a, b) => b.startDate.localeCompare(a.startDate));
    return Promise.resolve({ items: sorted.slice(0, limit), total: rows.length });
  });

describe('BookingsCompositeAdapter (ACC-12, ACC-17)', () => {
  const session = {} as ClientSession;
  const now = new Date('2026-11-18T00:00:00Z');

  function build(hotelRows: BookingSummary[], flightRows: BookingSummary[]) {
    const hotels = {
      hasUpcomingConfirmedBookings: jest.fn().mockResolvedValue(false),
      findBookingSummaries: source(hotelRows),
    };
    const flights = {
      hasUpcomingConfirmedBookings: jest.fn().mockResolvedValue(false),
      findBookingSummaries: source(flightRows),
    };
    const adapter = new BookingsCompositeAdapter(
      hotels as unknown as HotelBookingsService,
      flights as unknown as FlightBookingSummariesService,
      { now: () => now },
    );
    return { adapter, hotels, flights };
  }

  it('reports upcoming bookings from either source, checking hotels first', async () => {
    const { adapter, hotels, flights } = build([], []);
    expect(await adapter.hasUpcomingConfirmedBookings('u', now, session)).toBe(false);
    flights.hasUpcomingConfirmedBookings.mockResolvedValue(true);
    expect(await adapter.hasUpcomingConfirmedBookings('u', now, session)).toBe(true);
    hotels.hasUpcomingConfirmedBookings.mockResolvedValue(true);
    flights.hasUpcomingConfirmedBookings.mockClear();
    expect(await adapter.hasUpcomingConfirmedBookings('u', now, session)).toBe(true);
    expect(flights.hasUpcomingConfirmedBookings).not.toHaveBeenCalled();
    expect(hotels.hasUpcomingConfirmedBookings).toHaveBeenCalledWith('u', now, session);
  });

  it('merges both sources by start date before cutting the page', async () => {
    // Hotels on even days, flights on odd days: 12 + 11 = 23 bookings over 3 pages.
    const hotelRows = Array.from({ length: 12 }, (_, i) => row('HOTEL', `H${i}`, 2 * i + 2));
    const flightRows = Array.from({ length: 11 }, (_, i) => row('FLIGHT', `F${i}`, 2 * i + 1));
    const { adapter } = build(hotelRows, flightRows);
    const all = [...hotelRows, ...flightRows]
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
      .map((r) => r.reference);

    const pages = await Promise.all([1, 2, 3].map((page) => adapter.findBookings({ page })));
    expect(pages.map((p) => p.items.length)).toEqual([10, 10, 3]);
    expect(pages.flatMap((p) => p.items.map((r) => r.reference))).toEqual(all);
    expect(pages[0]).toMatchObject({ total: 23, page: 1, pageCount: 3 });
  });

  it('queries only the requested booking type', async () => {
    const { adapter, hotels, flights } = build([row('HOTEL', 'H', 2)], [row('FLIGHT', 'F', 1)]);
    const result = await adapter.findBookings({ page: 1, type: 'FLIGHT' });
    expect(result).toMatchObject({ total: 1, items: [{ reference: 'F' }] });
    expect(hotels.findBookingSummaries).not.toHaveBeenCalled();
    expect(flights.findBookingSummaries).toHaveBeenCalledWith({ page: 1, type: 'FLIGHT' }, 10, now);
  });

  it('orders ties by type then reference', async () => {
    const { adapter } = build(
      [row('HOTEL', 'A', 5)],
      [row('FLIGHT', 'Z', 5), row('FLIGHT', 'B', 5)],
    );
    const result = await adapter.findBookings({ page: 1 });
    expect(result.items.map((r) => r.reference)).toEqual(['B', 'Z', 'A']);
  });
});
