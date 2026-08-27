import { describe, it, expect } from 'vitest';
import { resolveDateRange, previousEqualPeriod, currentMonthPacing, cohortMonthKey, daysBetweenInclusive } from '../../../src/utils/dateRanges.js';

const FIXED_NOW = new Date('2026-08-17T10:00:00.000Z'); // a Monday, mid-August, mid-Q3

describe('dateRanges', () => {
  it('resolves 7d as a 7-day inclusive window ending today', () => {
    const range = resolveDateRange('7d', 'UTC', FIXED_NOW);
    expect(range).toEqual({ from: '2026-08-11', to: '2026-08-17' });
    expect(daysBetweenInclusive(range.from, range.to)).toBe(7);
  });

  it('resolves 30d as a 30-day inclusive window ending today', () => {
    const range = resolveDateRange('30d', 'UTC', FIXED_NOW);
    expect(daysBetweenInclusive(range.from, range.to)).toBe(30);
    expect(range.to).toBe('2026-08-17');
  });

  it('resolves mtd from the 1st of the current month', () => {
    const range = resolveDateRange('mtd', 'UTC', FIXED_NOW);
    expect(range).toEqual({ from: '2026-08-01', to: '2026-08-17' });
  });

  it('resolves qtd from the first month of the current quarter', () => {
    const range = resolveDateRange('qtd', 'UTC', FIXED_NOW);
    // August is in Q3 (Jul-Sep), so QTD starts July 1.
    expect(range).toEqual({ from: '2026-07-01', to: '2026-08-17' });
  });

  it('computes the immediately preceding equal-length period for period-over-period', () => {
    const range = { from: '2026-08-11', to: '2026-08-17' }; // 7 days
    const previous = previousEqualPeriod(range);
    expect(previous).toEqual({ from: '2026-08-04', to: '2026-08-10' });
  });

  it('computes month pacing anchors relative to the client timezone', () => {
    const pacing = currentMonthPacing('UTC', FIXED_NOW);
    expect(pacing.monthStart).toBe('2026-08-01');
    expect(pacing.dayOfMonth).toBe(17);
    expect(pacing.daysInMonth).toBe(31);
    expect(pacing.daysRemaining).toBe(14);
  });

  it('buckets a timestamp into its cohort month key in the given timezone', () => {
    expect(cohortMonthKey('2026-08-05T23:50:00.000Z', 'UTC')).toBe('2026-08');
    // Just before midnight UTC but past midnight in IST (+5:30) - still same/next day, cohort month usually stable either way.
    expect(cohortMonthKey('2026-01-31T20:00:00.000Z', 'Asia/Kolkata')).toBe('2026-02');
  });
});
