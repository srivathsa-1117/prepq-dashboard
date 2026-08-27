/**
 * Pure timezone/cron helpers for the in-process scheduler (syncScheduler.ts) - no I/O, so these
 * are trivial to unit test independent of Supabase. Uses Intl.DateTimeFormat rather than a date
 * library: Node's bundled full-icu already covers every IANA zone this app needs.
 */

export interface LocalTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function getLocalParts(date: Date, timeZone: string): LocalTimeParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

export function isSameLocalDate(a: Date, b: Date, timeZone: string): boolean {
  const pa = getLocalParts(a, timeZone);
  const pb = getLocalParts(b, timeZone);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

/**
 * Every cron expression ever generated in this codebase (DEFAULT_SYNC_SCHEDULE in
 * config/constants.ts, and the schedule-update API) follows this exact daily pattern - no other
 * field combination is supported or needed. Returns null for anything else so callers can reject
 * or fall back rather than silently mis-scheduling.
 */
export function parseSimpleDailyCron(expr: string): { hour: number; minute: number } | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  if (dayOfMonth !== '*' || month !== '*' || dayOfWeek !== '*') return null;

  const h = Number(hour);
  const m = Number(minute);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { hour: h, minute: m };
}

/**
 * True iff "now" (interpreted in timeZone) is at/after hour:minute today AND the job hasn't
 * already run today. Comparing calendar dates (not a fixed millisecond offset) is what makes
 * this resilient to the process restarting or a tick being missed - the next tick just re-checks
 * "have we run today yet?" rather than needing to fire at an exact instant.
 */
export function isDueToday(now: Date, timeZone: string, hour: number, minute: number, lastRunAt: string | null): boolean {
  const nowParts = getLocalParts(now, timeZone);
  if (nowParts.hour * 60 + nowParts.minute < hour * 60 + minute) return false;
  if (!lastRunAt) return true;
  return !isSameLocalDate(new Date(lastRunAt), now, timeZone);
}

/** How many minutes past today's scheduled local time "now" is - used for Meritto's wait-for-Meta/Google timeout. */
export function minutesPastScheduled(now: Date, timeZone: string, hour: number, minute: number): number {
  const p = getLocalParts(now, timeZone);
  return p.hour * 60 + p.minute - (hour * 60 + minute);
}
