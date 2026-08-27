import { describe, it, expect } from 'vitest';
import { getLocalParts, isSameLocalDate, parseSimpleDailyCron, isDueToday, minutesPastScheduled, isBackfillDue } from '../../../src/scheduler/scheduleTime.js';

describe('scheduleTime', () => {
  it('reads local calendar/time parts in a given IANA timezone', () => {
    const parts = getLocalParts(new Date('2026-08-27T19:00:00.000Z'), 'Asia/Kolkata');
    expect(parts).toEqual({ year: 2026, month: 8, day: 28, hour: 0, minute: 30 });
  });

  it('treats a UTC-adjacent instant as the next local calendar day in IST', () => {
    expect(isSameLocalDate(new Date('2026-08-27T19:00:00.000Z'), new Date('2026-08-28T01:00:00.000Z'), 'Asia/Kolkata')).toBe(true);
    expect(isSameLocalDate(new Date('2026-08-27T19:00:00.000Z'), new Date('2026-08-27T19:00:00.000Z'), 'UTC')).toBe(true);
    expect(isSameLocalDate(new Date('2026-08-27T00:00:00.000Z'), new Date('2026-08-28T00:00:00.000Z'), 'UTC')).toBe(false);
  });

  it('parses the one daily cron shape this codebase generates, rejecting anything else', () => {
    expect(parseSimpleDailyCron('0 6 * * *')).toEqual({ hour: 6, minute: 0 });
    expect(parseSimpleDailyCron('30 14 * * *')).toEqual({ hour: 14, minute: 30 });
    expect(parseSimpleDailyCron('0 6 * * 1')).toBeNull(); // day-of-week restricted - not supported
    expect(parseSimpleDailyCron('*/5 * * * *')).toBeNull();
    expect(parseSimpleDailyCron('not a cron')).toBeNull();
  });

  it('is due once at/after the scheduled local time and not yet run today', () => {
    const scheduled6amUTC = new Date('2026-08-27T06:00:00.000Z');
    expect(isDueToday(scheduled6amUTC, 'UTC', 6, 0, null)).toBe(true);
    expect(isDueToday(new Date('2026-08-27T05:59:00.000Z'), 'UTC', 6, 0, null)).toBe(false);
    expect(isDueToday(scheduled6amUTC, 'UTC', 6, 0, '2026-08-27T06:05:00.000Z')).toBe(false); // already ran today
    expect(isDueToday(scheduled6amUTC, 'UTC', 6, 0, '2026-08-26T06:05:00.000Z')).toBe(true); // last run was yesterday
  });

  it('computes minutes past the scheduled local time for the Meritto wait timeout', () => {
    expect(minutesPastScheduled(new Date('2026-08-27T06:00:00.000Z'), 'UTC', 6, 0)).toBe(0);
    expect(minutesPastScheduled(new Date('2026-08-27T07:30:00.000Z'), 'UTC', 6, 0)).toBe(90);
  });

  describe('isBackfillDue', () => {
    const now = new Date('2026-08-27T06:00:00.000Z');

    it('is due when no prior backfill has ever completed', () => {
      expect(isBackfillDue(null, now, 7)).toBe(true);
    });

    it('is not due when the last backfill completed within the interval', () => {
      const twoDaysAgo = new Date('2026-08-25T06:00:00.000Z');
      expect(isBackfillDue(twoDaysAgo, now, 7)).toBe(false);
    });

    it('is due once the interval has fully elapsed since the last backfill', () => {
      const sevenDaysAgo = new Date('2026-08-20T06:00:00.000Z');
      expect(isBackfillDue(sevenDaysAgo, now, 7)).toBe(true);
      const sixDaysAgo = new Date('2026-08-21T06:00:00.000Z');
      expect(isBackfillDue(sixDaysAgo, now, 7)).toBe(false);
    });
  });
});
