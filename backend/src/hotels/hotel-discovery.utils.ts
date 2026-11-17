/** Pure, side-effect-free availability/room selection helpers. */
export interface NightRange { from: string; to: string }
export interface PricedRoom {
  id: string;
  pricePerNight: number;
  maxOccupancy: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Night on check-in counts, check-out does not. Dates must be validated by the caller. */
export function stayNights(from: string, to: string): string[] {
  const nights: string[] = [];
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  for (let current = start; current < end; current += DAY_MS) {
    nights.push(new Date(current).toISOString().slice(0, 10));
  }
  return nights;
}

export function roomCoversStay(
  room: { availability: NightRange[]; blocked: NightRange[] },
  nights: string[],
): boolean {
  return nights.every((night) =>
    room.availability.some((range) => range.from <= night && night < range.to) &&
    !room.blocked.some((range) => range.from <= night && night < range.to),
  );
}

/**
 * Cheapest EXACT set of `count` distinct physical rooms accommodating all guests.
 * Dynamic programming handles cases where the cheapest rooms don't have enough capacity.
 * Returns null if the hotel cannot accommodate the requested number of rooms and guests.
 */
export function selectCheapestRoomSet<T extends PricedRoom>(
  rooms: T[], count: number, guests: number,
): T[] | null {
  if (!Number.isInteger(count) || !Number.isInteger(guests) || count < 1 || guests < count) {
    return null;
  }
  type State = { cents: number; selected: T[] };
  const dp: Array<Array<State | undefined>> = Array.from(
    { length: count + 1 }, () => Array<State | undefined>(guests + 1).fill(undefined),
  );
  dp[0][0] = { cents: 0, selected: [] };
  // Deterministic selections on price ties.
  const ordered = [...rooms].sort((a, b) =>
    a.pricePerNight - b.pricePerNight || a.id.localeCompare(b.id),
  );
  for (const room of ordered) {
    const priceCents = Math.round(room.pricePerNight * 100);
    for (let used = count; used >= 1; used--) {
      for (let covered = guests; covered >= 0; covered--) {
        const previous = dp[used - 1][covered];
        if (!previous) continue;
        const nextCapacity = Math.min(guests, covered + room.maxOccupancy);
        const nextCost = previous.cents + priceCents;
        if (!dp[used][nextCapacity] || nextCost < dp[used][nextCapacity]!.cents) {
          dp[used][nextCapacity] = {
            cents: nextCost,
            selected: [...previous.selected, room],
          };
        }
      }
    }
  }
  return dp[count][guests]?.selected ?? null;
}
