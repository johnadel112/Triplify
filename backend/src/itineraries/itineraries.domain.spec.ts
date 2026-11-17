import {
  addDaysToDate,
  groupConsecutiveDays,
  renumberAndRecalculateDays,
  ItineraryDay,
} from './itineraries.schema';
import { Types } from 'mongoose';

describe('Itineraries Domain Logic (ITN-05, ITN-07, ITN-08, ITN-09)', () => {
  describe('addDaysToDate date calculations', () => {
    it('correctly adds days across month boundaries', () => {
      expect(addDaysToDate('2026-07-30', 2)).toBe('2026-08-01');
      expect(addDaysToDate('2026-12-31', 1)).toBe('2027-01-01');
      expect(addDaysToDate('2028-02-28', 1)).toBe('2028-02-29'); // Leap year
    });

    it('returns exact date when adding 0 days', () => {
      expect(addDaysToDate('2026-06-15', 0)).toBe('2026-06-15');
    });
  });

  describe('renumberAndRecalculateDays (ITN-05, ITN-07, ITN-08)', () => {
    it('renumbers days strictly sequentially 1..N and recalculates dates starting from startDate', () => {
      const days: ItineraryDay[] = [
        {
          _id: new Types.ObjectId(),
          dayNumber: 99,
          date: '2020-01-01',
          cityCode: 'paris',
          activities: [],
          budgets: [],
        },
        {
          _id: new Types.ObjectId(),
          dayNumber: 5,
          date: '2020-01-02',
          cityCode: 'paris',
          activities: [],
          budgets: [],
        },
        {
          _id: new Types.ObjectId(),
          dayNumber: 1,
          date: '2020-01-03',
          cityCode: 'london',
          activities: [],
          budgets: [],
        },
      ];

      renumberAndRecalculateDays('2026-09-10', days);

      expect(days[0].dayNumber).toBe(1);
      expect(days[0].date).toBe('2026-09-10');

      expect(days[1].dayNumber).toBe(2);
      expect(days[1].date).toBe('2026-09-11');

      expect(days[2].dayNumber).toBe(3);
      expect(days[2].date).toBe('2026-09-12');
    });

    it('handles empty days array gracefully', () => {
      const days: ItineraryDay[] = [];
      renumberAndRecalculateDays('2026-09-10', days);
      expect(days).toEqual([]);
    });
  });

  describe('groupConsecutiveDays (ITN-09, ITN-25)', () => {
    it('groups consecutive days in the same city correctly into stays', () => {
      const days: ItineraryDay[] = [
        {
          _id: new Types.ObjectId(),
          dayNumber: 1,
          date: '2026-07-01',
          cityCode: 'paris',
          cityName: 'Paris',
          activities: [],
          budgets: [],
        },
        {
          _id: new Types.ObjectId(),
          dayNumber: 2,
          date: '2026-07-02',
          cityCode: 'paris',
          cityName: 'Paris',
          activities: [],
          budgets: [],
        },
        {
          _id: new Types.ObjectId(),
          dayNumber: 3,
          date: '2026-07-03',
          cityCode: 'paris',
          cityName: 'Paris',
          activities: [],
          budgets: [],
        },
        {
          _id: new Types.ObjectId(),
          dayNumber: 4,
          date: '2026-07-04',
          cityCode: 'london',
          cityName: 'London',
          activities: [],
          budgets: [],
        },
        {
          _id: new Types.ObjectId(),
          dayNumber: 5,
          date: '2026-07-05',
          cityCode: 'london',
          cityName: 'London',
          activities: [],
          budgets: [],
        },
      ];

      const groups = groupConsecutiveDays(days);
      expect(groups).toHaveLength(2);

      // Paris group
      expect(groups[0].cityCode).toBe('paris');
      expect(groups[0].cityName).toBe('Paris');
      expect(groups[0].startDay).toBe(1);
      expect(groups[0].endDay).toBe(3);
      expect(groups[0].startDate).toBe('2026-07-01');
      expect(groups[0].endDate).toBe('2026-07-03');
      expect(groups[0].checkInDate).toBe('2026-07-01');
      expect(groups[0].checkOutDate).toBe('2026-07-04');
      expect(groups[0].nights).toBe(3);
      expect(groups[0].dayIds).toHaveLength(3);

      // London group
      expect(groups[1].cityCode).toBe('london');
      expect(groups[1].cityName).toBe('London');
      expect(groups[1].startDay).toBe(4);
      expect(groups[1].endDay).toBe(5);
      expect(groups[1].startDate).toBe('2026-07-04');
      expect(groups[1].endDate).toBe('2026-07-05');
      expect(groups[1].checkInDate).toBe('2026-07-04');
      expect(groups[1].checkOutDate).toBe('2026-07-06');
      expect(groups[1].nights).toBe(2);
      expect(groups[1].dayIds).toHaveLength(2);
    });

    it('creates separate groups if a city is visited again non-consecutively', () => {
      const days: ItineraryDay[] = [
        {
          _id: new Types.ObjectId(),
          dayNumber: 1,
          date: '2026-07-01',
          cityCode: 'cairo',
          activities: [],
          budgets: [],
        },
        {
          _id: new Types.ObjectId(),
          dayNumber: 2,
          date: '2026-07-02',
          cityCode: 'dubai',
          activities: [],
          budgets: [],
        },
        {
          _id: new Types.ObjectId(),
          dayNumber: 3,
          date: '2026-07-03',
          cityCode: 'cairo',
          activities: [],
          budgets: [],
        },
      ];

      const groups = groupConsecutiveDays(days);
      expect(groups).toHaveLength(3);
      expect(groups[0].cityCode).toBe('cairo');
      expect(groups[1].cityCode).toBe('dubai');
      expect(groups[2].cityCode).toBe('cairo');
    });

    it('returns empty array when days list is empty', () => {
      expect(groupConsecutiveDays([])).toEqual([]);
    });
  });
});
