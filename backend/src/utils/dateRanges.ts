import type { DateRangePreset } from '../config/constants.js';

export interface DateRange {
  /** Inclusive, YYYY-MM-DD, in the client's timezone. */
  from: string;
  /** Inclusive, YYYY-MM-DD, in the client's timezone. */
  to: string;
}

/** "Today" as YYYY-MM-DD in the given IANA timezone - the anchor for every relative range. */
export function todayInTimezone(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function parseISODate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function formatISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = parseISODate(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return formatISODate(d);
}

export function daysBetweenInclusive(from: string, to: string): number {
  const a = parseISODate(from).getTime();
  const b = parseISODate(to).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

export function resolveDateRange(preset: DateRangePreset, timezone: string, now: Date = new Date()): DateRange {
  const today = todayInTimezone(timezone, now);

  switch (preset) {
    case '7d':
      return { from: addDays(today, -6), to: today };
    case '30d':
      return { from: addDays(today, -29), to: today };
    case 'mtd': {
      const [y, m] = today.split('-');
      return { from: `${y}-${m}-01`, to: today };
    }
    case 'qtd': {
      const [y, m] = today.split('-').map(Number) as [number, number];
      const quarterStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: `${y}-${String(quarterStartMonth).padStart(2, '0')}-01`, to: today };
    }
    default: {
      const _exhaustive: never = preset;
      throw new Error(`Unknown date range preset: ${String(_exhaustive)}`);
    }
  }
}

/** The immediately preceding period of equal length, for period-over-period deltas. */
export function previousEqualPeriod(range: DateRange): DateRange {
  const lengthDays = daysBetweenInclusive(range.from, range.to);
  const to = addDays(range.from, -1);
  const from = addDays(to, -(lengthDays - 1));
  return { from, to };
}

export function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/** Current month pacing anchors, independent of any range filter. */
export function currentMonthPacing(timezone: string, now: Date = new Date()) {
  const today = todayInTimezone(timezone, now);
  const [yearStr, monthStr, dayStr] = today.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const dayOfMonth = Number(dayStr);
  const totalDays = daysInMonth(year, month);
  return {
    monthStart: `${yearStr}-${monthStr}-01`,
    today,
    dayOfMonth,
    daysInMonth: totalDays,
    daysRemaining: totalDays - dayOfMonth,
  };
}

/** Cohort month key, e.g. "2026-08", for a created_at timestamp in the client's timezone. */
export function cohortMonthKey(isoTimestamp: string, timezone: string): string {
  const d = new Date(isoTimestamp);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit' }).format(d);
  return parts;
}

/** Calendar day key, e.g. "2026-08-27", for a created_at timestamp in the client's timezone. */
export function dayKey(isoTimestamp: string, timezone: string): string {
  const d = new Date(isoTimestamp);
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function hoursBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 3_600_000;
}
