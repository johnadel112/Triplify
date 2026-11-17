import { RoomInventorySnapshot } from './hotel-inventory.port';
import {
  centsToDecimal,
  daysBetween,
  localDate,
  parseDateOnly,
  roomCoversNights,
  stayNights,
  toCents,
  zonedDateTimeToUtc,
} from './stay-dates';

describe('stay-dates helpers (HTL-16, HTL-18, HTL-21)', () => {
  it('rejects impossible calendar dates', () => {
    expect(parseDateOnly('2026-02-30')).toBeNull();
    expect(parseDateOnly('2026-13-01')).toBeNull();
    expect(parseDateOnly('26-01-01')).toBeNull();
    expect(parseDateOnly('2028-02-29')).not.toBeNull();
  });

  it('lists nights check-in inclusive, check-out exclusive, across month ends', () => {
    expect(stayNights('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
    ]);
    expect(stayNights('2026-12-01', '2026-12-01')).toEqual([]);
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
  });

  it('computes the hotel-local date for an instant', () => {
    const instant = new Date('2026-12-01T23:30:00Z');
    expect(localDate(instant, 'UTC')).toBe('2026-12-01');
    expect(localDate(instant, 'Africa/Cairo')).toBe('2026-12-02');
    expect(localDate(instant, 'America/New_York')).toBe('2026-12-01');
  });

  it('converts hotel-local check-in time to UTC, honouring DST', () => {
    expect(zonedDateTimeToUtc('2026-12-01', '15:00', 'Africa/Cairo').toISOString()).toBe(
      '2026-12-01T13:00:00.000Z',
    );
    // New York: EST (UTC-5) in January, EDT (UTC-4) in July.
    expect(zonedDateTimeToUtc('2027-01-15', '11:00', 'America/New_York').toISOString()).toBe(
      '2027-01-15T16:00:00.000Z',
    );
    expect(zonedDateTimeToUtc('2027-07-15', '11:00', 'America/New_York').toISOString()).toBe(
      '2027-07-15T15:00:00.000Z',
    );
  });

  it('checks availability ranges and blocked ranges night by night', () => {
    const room: RoomInventorySnapshot = {
      id: 'r',
      hotelId: 'h',
      name: '101',
      type: 'Double',
      beds: 1,
      maxOccupancy: 2,
      pricePerNight: 100,
      active: true,
      availability: [
        { from: '2026-12-01', to: '2026-12-10' },
        { from: '2026-12-10', to: '2026-12-20' },
      ],
      blocked: [{ from: '2026-12-15', to: '2026-12-16' }],
    };
    expect(roomCoversNights(room, stayNights('2026-12-08', '2026-12-12'))).toBe(true);
    expect(roomCoversNights(room, stayNights('2026-12-14', '2026-12-16'))).toBe(false);
    expect(roomCoversNights(room, stayNights('2026-12-16', '2026-12-20'))).toBe(true);
    expect(roomCoversNights(room, stayNights('2026-12-19', '2026-12-21'))).toBe(false);
  });

  it('handles money in integer cents', () => {
    expect(toCents(19.99) * 3).toBe(5997);
    expect(centsToDecimal(5997)).toBe('59.97');
  });
});
