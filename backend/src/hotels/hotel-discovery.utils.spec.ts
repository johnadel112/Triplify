import { roomCoversStay, selectCheapestRoomSet, stayNights } from './hotel-discovery.utils';

describe('hotel discovery', () => {
  it('checks check-in inclusive and check-out exclusive, respecting blocked nights', () => {
    const nights = stayNights('2026-12-20', '2026-12-23');
    expect(nights).toEqual(['2026-12-20', '2026-12-21', '2026-12-22']);
    const room = {
      availability: [{ from: '2026-12-19', to: '2026-12-23' }],
      blocked: [{ from: '2026-12-23', to: '2026-12-24' }],
    };
    expect(roomCoversStay(room, nights)).toBe(true);
    room.blocked = [{ from: '2026-12-21', to: '2026-12-22' }];
    expect(roomCoversStay(room, nights)).toBe(false);
  });

  it('chooses a room set with enough combined occupancy, not just cheapest units', () => {
    const rooms = [
      { id: 'a', pricePerNight: 50, maxOccupancy: 1 },
      { id: 'b', pricePerNight: 60, maxOccupancy: 1 },
      { id: 'c', pricePerNight: 80, maxOccupancy: 3 },
    ];
    expect(selectCheapestRoomSet(rooms, 2, 4)?.map((r) => r.id)).toEqual(['a', 'c']);
    expect(selectCheapestRoomSet(rooms, 1, 4)).toBeNull();
    expect(selectCheapestRoomSet(rooms, 3, 3)?.length).toBe(3);
  });
});
