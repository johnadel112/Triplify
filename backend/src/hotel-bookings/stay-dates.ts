import { NightRange, RoomInventorySnapshot } from './hotel-inventory.port';

const DAY_MS = 24 * 60 * 60 * 1000;
export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Parses a real calendar date `YYYY-MM-DD` to its UTC-midnight epoch, or returns null. */
export function parseDateOnly(value: string): number | null {
  if (!DATE_ONLY.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d)
    return null;
  return ms;
}

function formatDateOnly(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both `YYYY-MM-DD`). */
export function daysBetween(from: string, to: string): number {
  const a = parseDateOnly(from);
  const b = parseDateOnly(to);
  if (a === null || b === null) throw new Error('Invalid date');
  return Math.round((b - a) / DAY_MS);
}

/** Night dates of a stay: check-in inclusive, check-out exclusive. */
export function stayNights(checkInDate: string, checkOutDate: string): string[] {
  const start = parseDateOnly(checkInDate);
  const end = parseDateOnly(checkOutDate);
  if (start === null || end === null) throw new Error('Invalid date');
  const nights: string[] = [];
  for (let t = start; t < end; t += DAY_MS) nights.push(formatDateOnly(t));
  return nights;
}

/** Calendar date `YYYY-MM-DD` of `instant` in the IANA time zone `timeZone`. */
export function localDate(instant: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** Offset (ms) of `timeZone` from UTC at `instant`. */
function zoneOffset(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** Converts a hotel-local date and `HH:mm` time to the UTC instant, honouring DST. */
export function zonedDateTimeToUtc(date: string, time: string, timeZone: string): Date {
  const day = parseDateOnly(date);
  const match = TIME_HHMM.exec(time);
  if (day === null || !match) throw new Error('Invalid local date or time');
  const wallClock = day + Number(match[1]) * 3600000 + Number(match[2]) * 60000;
  // Two passes resolve the offset correctly around DST transitions.
  let utc = wallClock - zoneOffset(wallClock, timeZone);
  utc = wallClock - zoneOffset(utc, timeZone);
  return new Date(utc);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function isValidTime(time: string): boolean {
  return TIME_HHMM.test(time);
}

const inRange = (night: string, range: NightRange) => range.from <= night && night < range.to;

/** HTL-04/HTL-06: every night is inside an availability range and outside every blocked range. */
export function roomCoversNights(room: RoomInventorySnapshot, nights: string[]): boolean {
  return nights.every(
    (night) =>
      room.availability.some((range) => inRange(night, range)) &&
      !room.blocked.some((range) => inRange(night, range)),
  );
}

/** Money is handled in integer cents to avoid floating-point drift. */
export const toCents = (amount: number) => Math.round(amount * 100);
export const centsToDecimal = (cents: number) => (cents / 100).toFixed(2);
