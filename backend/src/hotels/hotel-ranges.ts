import { BadRequestException } from '@nestjs/common';
import { RoomNightRange } from './room.schema';

/** Validate an actual Gregorian calendar date, not just a string matching YYYY-MM-DD. */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Adjacent ranges (to === next.from) are fine; overlapping ranges are not. */
export function validateNightRanges(ranges: RoomNightRange[]): RoomNightRange[] {
  const sorted = [...ranges].sort((a, b) => a.from.localeCompare(b.from));
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    if (!isCalendarDate(current.from) || !isCalendarDate(current.to) || current.from >= current.to) {
      throw new BadRequestException('Each range must have real YYYY-MM-DD dates with from < to');
    }
    if (index > 0 && sorted[index - 1].to > current.from) {
      throw new BadRequestException('Date ranges must not overlap');
    }
  }
  return sorted;
}

export function rangesOverlap(a: RoomNightRange, b: RoomNightRange): boolean {
  return a.from < b.to && b.from < a.to;
}

/** True if ALL nights of a booking are covered by (possibly adjacent) availability ranges. */
export function fullyCovered(
  ranges: RoomNightRange[],
  from: string,
  to: string,
): boolean {
  let coveredUntil = from;
  for (const range of ranges) {
    if (range.to <= coveredUntil) continue;
    if (range.from > coveredUntil) return false;
    coveredUntil = range.to;
    if (coveredUntil >= to) return true;
  }
  return false;
}

/** Date in the hotel's IANA time zone; avoids machine-local time zone assumptions. */
export function hotelToday(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (kind: string) => parts.find((p) => p.type === kind)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
