/**
 * Pure metric calculations implementing the dashboard definitions from the
 * PrepQ handoff brief (Section 6) / build spec (Section 15). Deliberately
 * dependency-free (no Supabase, no fetch) so every rule can be unit tested
 * against plain fixture objects - see tests/unit/services/reporting.calculations.test.ts.
 */
import { FATIGUE_MIN_LEADS_PER_WINDOW, FATIGUE_STEADY_THRESHOLD_PP, SPEED_TO_LEAD_BUCKETS, UNCALLED_AGING_BUCKETS } from '../config/constants.js';
import { cohortMonthKey, hoursBetween } from '../utils/dateRanges.js';
import type { LeadRow } from '../repositories/reportingRepo.js';

// ---------------------------------------------------------------------------
// Basic counts and rates
// ---------------------------------------------------------------------------

export function countLeads(leads: LeadRow[]): number {
  return leads.length;
}

export function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function qualifiedRate(leads: LeadRow[]): number {
  return rate(leads.filter((l) => l.status === 'qualified').length, leads.length);
}

export function junkRate(leads: LeadRow[]): number {
  return rate(leads.filter((l) => l.status === 'junk').length, leads.length);
}

export function countEnrolled(leads: LeadRow[]): number {
  return leads.filter((l) => l.enrolled_at !== null).length;
}

// ---------------------------------------------------------------------------
// Speed to lead
// ---------------------------------------------------------------------------

export interface SpeedToLeadBucketResult {
  bucket: (typeof SPEED_TO_LEAD_BUCKETS)[number];
  leads: number;
  connected: number;
  connectRate: number;
}

export interface SpeedToLeadResult {
  medianHours: number | null;
  buckets: SpeedToLeadBucketResult[];
  neverCalled: number;
  /** Called, but created_at/first_call_at's day-vs-second granularity mismatch makes the gap unmeasurable (see speedToLead's doc comment) - not dropped silently, surfaced so the bucket totals don't look like they're missing leads. */
  notTimeable: number;
}

function bucketForHours(hours: number): (typeof SPEED_TO_LEAD_BUCKETS)[number] {
  if (hours < 1) return '<1h';
  if (hours < 4) return '1-4h';
  if (hours < 24) return '4-24h';
  return '>24h';
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function speedToLead(leads: LeadRow[]): SpeedToLeadResult {
  // created_at is day-granularity for this account (see deriveCreatedAtFromLeadAge in
  // merittoTransform.ts - no real per-lead creation time exists, only a whole-day age), while
  // first_call_at is a real sub-day activity timestamp. Diffing the two goes negative whenever
  // the true creation moment was later in the day than its synthesized midnight anchor but the
  // real call happened earlier the same calendar day - a same-day call, not a time-travel one.
  // We genuinely can't say which hour bucket these belong to (true speed-to-lead could be
  // anywhere from minutes to ~23h), so rather than fabricate a bucket - bucketForHours has no
  // floor, so an uncorrected negative value would land 100% of these in '<1h', falsely inflating
  // it (live-verified: ~19% of leads with a recorded first call) - they're excluded from both the
  // median and the bucket histogram entirely.
  const everCalled = leads.filter((l) => l.first_call_at !== null);
  const neverCalled = leads.length - everCalled.length;
  const called = everCalled.filter((l) => hoursBetween(l.created_at, l.first_call_at!) >= 0);
  const notTimeable = everCalled.length - called.length;
  const hoursList = called.map((l) => hoursBetween(l.created_at, l.first_call_at!));

  const buckets = new Map<(typeof SPEED_TO_LEAD_BUCKETS)[number], { leads: number; connected: number }>(
    SPEED_TO_LEAD_BUCKETS.map((b) => [b, { leads: 0, connected: 0 }]),
  );

  called.forEach((lead, i) => {
    const bucket = bucketForHours(hoursList[i]!);
    const entry = buckets.get(bucket)!;
    entry.leads += 1;
    if (lead.connected) entry.connected += 1;
  });

  return {
    medianHours: median(hoursList),
    buckets: SPEED_TO_LEAD_BUCKETS.map((b) => {
      const entry = buckets.get(b)!;
      return { bucket: b, leads: entry.leads, connected: entry.connected, connectRate: rate(entry.connected, entry.leads) };
    }),
    neverCalled,
    notTimeable,
  };
}

// ---------------------------------------------------------------------------
// Uncalled aging (live queue, not range-filtered)
// ---------------------------------------------------------------------------

export interface UncalledAgingResult {
  buckets: Array<{ bucket: (typeof UNCALLED_AGING_BUCKETS)[number]; leads: number }>;
  byOwner: Array<{ owner: string; leads: number }>;
}

function agingBucketForHours(hours: number): (typeof UNCALLED_AGING_BUCKETS)[number] {
  if (hours < 24) return '<24h';
  if (hours < 48) return '24-48h';
  return '>48h';
}

export function uncalledAging(uncalledLeads: LeadRow[], now: Date = new Date()): UncalledAgingResult {
  const bucketCounts = new Map<(typeof UNCALLED_AGING_BUCKETS)[number], number>(UNCALLED_AGING_BUCKETS.map((b) => [b, 0]));
  const ownerCounts = new Map<string, number>();

  for (const lead of uncalledLeads) {
    const hours = hoursBetween(lead.created_at, now.toISOString());
    const bucket = agingBucketForHours(hours);
    bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);

    const owner = lead.owner ?? 'Unassigned';
    ownerCounts.set(owner, (ownerCounts.get(owner) ?? 0) + 1);
  }

  return {
    buckets: UNCALLED_AGING_BUCKETS.map((b) => ({ bucket: b, leads: bucketCounts.get(b) ?? 0 })),
    byOwner: [...ownerCounts.entries()]
      .map(([owner, leads]) => ({ owner, leads }))
      .sort((a, b) => b.leads - a.leads),
  };
}

// ---------------------------------------------------------------------------
// Follow-up depth
// ---------------------------------------------------------------------------

/** connect_attempt values of 5+ (real, e.g. a lead who took 7 tries) fold into a single "5" bucket, labeled "Attempt 5+" on the dashboard, rather than a fixed 1-4 range that silently dropped them - a connected lead with connect_attempt >= 5 previously matched neither the byAttempt range check nor the neverConnected branch (`!lead.connected` is false for them), vanishing from the widget's total entirely. */
const MAX_ATTEMPT_BUCKET = 5;

/**
 * `noActivity` (leads with call_attempts === 0, i.e. no log at all) used to be silently dropped
 * entirely: they matched neither the byAttempt range check nor `neverConnected` (which only
 * counted leads that were actually called but never connected), because both live inside the
 * `called` loop. Counted separately here instead, per the client's own request to surface
 * no-log leads as "No Activity / No Log" rather than making them vanish from the total.
 */
export function followUpDepth(leads: LeadRow[]): { byAttempt: Record<number, number>; neverConnected: number; noActivity: number } {
  const called = leads.filter((l) => l.call_attempts > 0);
  const noActivity = leads.length - called.length;
  const byAttempt: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, [MAX_ATTEMPT_BUCKET]: 0 };
  let neverConnected = 0;

  for (const lead of called) {
    if (lead.connect_attempt && lead.connect_attempt >= 1) {
      const bucket = Math.min(lead.connect_attempt, MAX_ATTEMPT_BUCKET);
      byAttempt[bucket] = (byAttempt[bucket] ?? 0) + 1;
    } else if (!lead.connected) {
      neverConnected += 1;
    }
  }

  return { byAttempt, neverConnected, noActivity };
}

// ---------------------------------------------------------------------------
// Funnel
// ---------------------------------------------------------------------------

export interface FunnelStage {
  stage: 'leads' | 'connected' | 'qualified' | 'demo_booked' | 'demo_attended' | 'enrolled';
  count: number;
  pctOfTotal: number;
  pctOfPrevious: number | null;
}

export function funnel(leads: LeadRow[]): FunnelStage[] {
  const total = leads.length;
  const counts = {
    leads: total,
    connected: leads.filter((l) => l.connected).length,
    qualified: leads.filter((l) => l.status === 'qualified').length,
    demo_booked: leads.filter((l) => l.demo_booked_at !== null).length,
    demo_attended: leads.filter((l) => l.demo_attended_at !== null).length,
    enrolled: leads.filter((l) => l.enrolled_at !== null).length,
  } as const;

  const order: Array<keyof typeof counts> = ['leads', 'connected', 'qualified', 'demo_booked', 'demo_attended', 'enrolled'];

  return order.map((stage, i) => {
    const count = counts[stage];
    const previous = i > 0 ? counts[order[i - 1]!] : null;
    return {
      stage,
      count,
      pctOfTotal: rate(count, total),
      // Stages here are independent flags on the same lead (connected/status/demo_*/enrolled_at),
      // not a strictly nested funnel - a lead can be marked qualified via a disposition rule
      // without ever having `connected` set (e.g. imported already-Warm, or qualified through a
      // channel this account's activity log doesn't capture as a call). That's real, not a bug,
      // but it means count can exceed `previous` in a small enough sample, which would otherwise
      // render as a nonsensical >100% "conversion from previous stage". Capped at 100% since a
      // percentage of a stage can never truthfully exceed all of it.
      pctOfPrevious: previous !== null ? Math.min(1, rate(count, previous)) : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Spend-derived metrics
// ---------------------------------------------------------------------------

export function costPerLead(spend: number, leads: number): number | null {
  return leads === 0 ? null : spend / leads;
}

export function costPerQualified(spend: number, qualified: number): number | null {
  return qualified === 0 ? null : spend / qualified;
}

export function costPerEnrollment(spend: number, enrolled: number): number | null {
  return enrolled === 0 ? null : spend / enrolled;
}

export function returnOnAdSpend(revenue: number, spend: number): number | null {
  return spend === 0 ? null : revenue / spend;
}

export function effectiveFee(feePaid: number | null, courseFee: number | undefined): number {
  if (feePaid !== null) return feePaid;
  return courseFee ?? 0;
}

// ---------------------------------------------------------------------------
// Cohort conversion
// ---------------------------------------------------------------------------

export type CohortMaturity = 'matured' | 'mostly_matured' | 'still_maturing';

export interface CohortResult {
  month: string;
  leads: number;
  enrolled: number;
  enrolledRate: number;
  maturity: CohortMaturity;
}

function cohortMaturity(monthKey: string, timezone: string, now: Date): CohortMaturity {
  const [year, month] = monthKey.split('-').map(Number) as [number, number];
  const nowMonthKey = cohortMonthKey(now.toISOString(), timezone);
  const [nowYear, nowMonth] = nowMonthKey.split('-').map(Number) as [number, number];
  const monthsSince = (nowYear - year) * 12 + (nowMonth - month);

  if (monthsSince >= 3) return 'matured';
  if (monthsSince >= 1) return 'mostly_matured';
  return 'still_maturing';
}

export function cohortConversion(leads: LeadRow[], timezone: string, now: Date = new Date()): CohortResult[] {
  const byMonth = new Map<string, LeadRow[]>();
  for (const lead of leads) {
    const key = cohortMonthKey(lead.created_at, timezone);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(lead);
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, monthLeads]) => {
      const enrolled = countEnrolled(monthLeads);
      return {
        month,
        leads: monthLeads.length,
        enrolled,
        enrolledRate: rate(enrolled, monthLeads.length),
        maturity: cohortMaturity(month, timezone, now),
      };
    });
}

// ---------------------------------------------------------------------------
// Period-over-period delta
// ---------------------------------------------------------------------------

export interface PeriodDelta {
  current: number;
  previous: number;
  deltaAbs: number;
  deltaPct: number | null;
}

export function periodOverPeriodDelta(current: number, previous: number): PeriodDelta {
  return {
    current,
    previous,
    deltaAbs: current - previous,
    deltaPct: previous === 0 ? null : (current - previous) / previous,
  };
}

// ---------------------------------------------------------------------------
// Arrival heatmap: day-of-week x 3-hour block
// ---------------------------------------------------------------------------

export interface HeatmapCell {
  dayOfWeek: number; // 0 = Sunday .. 6 = Saturday
  blockStartHour: number; // 0, 3, 6, ... 21
  leads: number;
  connected: number;
  connectRate: number;
}

export function arrivalHeatmap(leads: LeadRow[], timezone: string): HeatmapCell[] {
  const cells = new Map<string, { leads: number; connected: number }>();

  for (const lead of leads) {
    const d = new Date(lead.created_at);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: 'numeric',
      hour12: false,
    }).formatToParts(d);

    const weekdayShort = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
    const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0';
    const hour = Number(hourStr) % 24;

    const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayShort);
    const blockStartHour = Math.floor(hour / 3) * 3;
    const key = `${weekdayIndex}:${blockStartHour}`;

    const entry = cells.get(key) ?? { leads: 0, connected: 0 };
    entry.leads += 1;
    if (lead.connected) entry.connected += 1;
    cells.set(key, entry);
  }

  const result: HeatmapCell[] = [];
  for (let day = 0; day < 7; day++) {
    for (let block = 0; block < 8; block++) {
      const blockStartHour = block * 3;
      const entry = cells.get(`${day}:${blockStartHour}`) ?? { leads: 0, connected: 0 };
      result.push({ dayOfWeek: day, blockStartHour, leads: entry.leads, connected: entry.connected, connectRate: rate(entry.connected, entry.leads) });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Target pacing (current month, ignores range filter)
// ---------------------------------------------------------------------------

export interface TargetPacingResult {
  target: number;
  actual: number;
  expectedByNow: number;
  aheadBehind: number;
  requiredDailyRunRate: number;
}

export function targetPacing(input: {
  target: number;
  actualMtdLeads: number;
  dayOfMonth: number;
  daysInMonth: number;
  daysRemaining: number;
}): TargetPacingResult {
  const expectedByNow = input.target * (input.dayOfMonth / input.daysInMonth);
  const aheadBehind = input.actualMtdLeads - expectedByNow;
  const remainingTarget = Math.max(input.target - input.actualMtdLeads, 0);
  const requiredDailyRunRate = input.daysRemaining > 0 ? remainingTarget / input.daysRemaining : remainingTarget;

  return { target: input.target, actual: input.actualMtdLeads, expectedByNow, aheadBehind, requiredDailyRunRate };
}

// ---------------------------------------------------------------------------
// Creative fatigue
// ---------------------------------------------------------------------------

export type FatigueTrend = 'steady' | 'improving' | 'declining' | 'insufficient_data';

export interface FatigueResult {
  trend: FatigueTrend;
  currentWindowRate: number | null;
  previousWindowRate: number | null;
  deltaPp: number | null;
}

/**
 * Compares trailing-14-day qualified rate against the preceding 14 days.
 * Suppressed (insufficient_data) when either window has fewer than
 * FATIGUE_MIN_LEADS_PER_WINDOW leads, per spec §14/§15.
 */
export function creativeFatigue(
  currentWindow: { leads: number; qualified: number },
  previousWindow: { leads: number; qualified: number },
): FatigueResult {
  if (currentWindow.leads < FATIGUE_MIN_LEADS_PER_WINDOW || previousWindow.leads < FATIGUE_MIN_LEADS_PER_WINDOW) {
    return { trend: 'insufficient_data', currentWindowRate: null, previousWindowRate: null, deltaPp: null };
  }

  const currentRate = rate(currentWindow.qualified, currentWindow.leads);
  const previousRate = rate(previousWindow.qualified, previousWindow.leads);
  const deltaPp = (currentRate - previousRate) * 100;

  let trend: FatigueTrend = 'steady';
  if (Math.abs(deltaPp) >= FATIGUE_STEADY_THRESHOLD_PP) {
    trend = deltaPp > 0 ? 'improving' : 'declining';
  }

  return { trend, currentWindowRate: currentRate, previousWindowRate: previousRate, deltaPp };
}

// ---------------------------------------------------------------------------
// Lead quality breakdown (Overview "Lead quality" widget)
// ---------------------------------------------------------------------------

export const LEAD_STATUSES = ['qualified', 'not_qualified', 'not_reachable', 'junk', 'uncalled'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface LeadQualityBucket {
  status: LeadStatus;
  count: number;
  pctOfTotal: number;
}

export function leadQualityBreakdown(leads: LeadRow[]): LeadQualityBucket[] {
  const total = leads.length;
  return LEAD_STATUSES.map((status) => {
    const count = leads.filter((l) => l.status === status).length;
    return { status, count, pctOfTotal: rate(count, total) };
  });
}

// ---------------------------------------------------------------------------
// Disqualification reasons ("Why leads disqualify")
// ---------------------------------------------------------------------------

export interface DisqualificationReasonBucket {
  reason: string;
  count: number;
  pctOfDisqualified: number;
}

/**
 * Reasons are whatever this client's Meritto dq_reason vocabulary actually contains - never a
 * hardcoded list, since it's client-configured (handoff brief §5). Covers both 'not_qualified'
 * and 'junk' statuses - merittoDispositionMap.ts assigns a dqReason to both (junk = attempts
 * exhausted without connecting), so excluding junk here undercounted disqualifications and
 * skewed the shown percentages relative to how many leads actually got disqualified.
 */
export function disqualificationReasons(leads: LeadRow[]): DisqualificationReasonBucket[] {
  const withReason = leads.filter((l) => (l.status === 'not_qualified' || l.status === 'junk') && l.dqReason);
  const counts = new Map<string, number>();
  for (const lead of withReason) {
    const reason = lead.dqReason!;
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count, pctOfDisqualified: rate(count, withReason.length) }))
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Sales team performance table
// ---------------------------------------------------------------------------

export interface SalesTeamRow {
  owner: string;
  leadsAssigned: number;
  medianResponseHours: number | null;
  uncalledOver24h: number;
  connected: number;
  qualified: number;
  enrolled: number;
  leadToEnrolmentRate: number;
}

/**
 * `rangedLeads` drives assigned/connected/qualified/enrolled/median-response
 * (respects the date-range filter); `uncalledLeads` is the live, unfiltered
 * uncalled queue (spec §15: "uncalled queue should remain a live/current
 * operational metric") - both are already fetched by services/reportingService.ts::getSales,
 * so this needs no extra query.
 */
export function salesTeamBreakdown(rangedLeads: LeadRow[], uncalledLeads: LeadRow[], now: Date = new Date()): SalesTeamRow[] {
  const owners = new Set<string>();
  for (const lead of rangedLeads) if (lead.owner) owners.add(lead.owner);
  for (const lead of uncalledLeads) if (lead.owner) owners.add(lead.owner);

  const rows = [...owners].map((owner) => {
    const assigned = rangedLeads.filter((l) => l.owner === owner);
    const called = assigned.filter((l) => l.first_call_at !== null);
    const connected = assigned.filter((l) => l.connected).length;
    const qualified = assigned.filter((l) => l.status === 'qualified').length;
    const enrolled = countEnrolled(assigned);
    const uncalledOver24h = uncalledLeads.filter((l) => l.owner === owner && hoursBetween(l.created_at, now.toISOString()) >= 24).length;

    // Same exclusion speedToLead already applies and explains in its own doc comment: created_at
    // is day-granularity (reconstructed from a whole-day lead_age, not a real timestamp - see
    // deriveCreatedAtFromLeadAge), so a same-day call can diff out negative against it. Without this
    // filter a single such lead dominates median() on a small per-owner sample - live-confirmed
    // (post-2026-11-13 owner-mapping fix) a rep with only 2 EA leads showed a median response of
    // "-56115m" once their bucket was correctly small enough for one bad data point to control it.
    const timeableHours = called.map((l) => hoursBetween(l.created_at, l.first_call_at!)).filter((h) => h >= 0);

    return {
      owner,
      leadsAssigned: assigned.length,
      medianResponseHours: median(timeableHours),
      uncalledOver24h,
      connected,
      qualified,
      enrolled,
      leadToEnrolmentRate: rate(enrolled, assigned.length),
    };
  });

  return rows.sort((a, b) => b.leadToEnrolmentRate - a.leadToEnrolmentRate);
}
