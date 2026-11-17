import { fullyCovered, isCalendarDate, rangesOverlap, validateNightRanges } from './hotel-ranges';

describe('hotel date ranges', () => {
  it('rejects invalid dates and reversed stays', () => {
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(() => validateNightRanges([{ from: '2026-12-05', to: '2026-12-01' }])).toThrow();
  });
  it('rejects overlapping availability ranges', () => {
    expect(() => validateNightRanges([
      { from: '2026-12-01', to: '2026-12-05' },
      { from: '2026-12-04', to: '2026-12-09' },
    ])).toThrow();
  });
  it('accepts adjacent intervals and checks booking coverage', () => {
    const ranges = validateNightRanges([
      { from: '2026-12-04', to: '2026-12-06' },
      { from: '2026-12-01', to: '2026-12-04' },
    ]);
    expect(fullyCovered(ranges, '2026-12-01', '2026-12-06')).toBe(true);
    expect(fullyCovered(ranges, '2026-12-01', '2026-12-07')).toBe(false);
    expect(rangesOverlap(ranges[0], { from: '2026-12-06', to: '2026-12-08' })).toBe(false);
    expect(rangesOverlap(ranges[1], { from: '2026-12-05', to: '2026-12-07' })).toBe(true);
  });
});
