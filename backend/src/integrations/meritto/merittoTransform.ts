import type {
  MerittoActivity,
  MerittoActivityCode,
  MerittoLead,
  MerittoPayment,
  NormalizedMerittoActivity,
  NormalizedMerittoLead,
  NormalizedMerittoPayment,
} from '../../types/meritto.js';

/**
 * Meritto's real API sends `owner` as a one-element array of an opaque internal user id, not the
 * plain string the documented field type implies (confirmed live - every lead in this account has
 * this shape). Handles a bare string too in case a future account/endpoint variant sends one
 * directly, and anything else (missing, empty array, wrong type) resolves to null rather than
 * guessing.
 */
export function extractOwnerRef(owner: string | string[] | undefined): string | null {
  if (Array.isArray(owner)) return typeof owner[0] === 'string' && owner[0].length > 0 ? owner[0] : null;
  if (typeof owner === 'string' && owner.length > 0) return owner;
  return null;
}

function normalizeSourceLabel(rawSource: string | undefined): string | null {
  if (!rawSource) return null;
  const lower = rawSource.toLowerCase();
  if (lower.includes('facebook') || lower.includes('meta') || lower.includes('instagram')) return 'meta';
  if (lower.includes('google')) return 'google';
  if (lower.includes('organic')) return 'organic';
  return lower;
}

/**
 * No field in this account's lead schema carries a creation timestamp
 * (confirmed empirically - requested every plausible field name against a
 * real lead and none returned a value). `lead_age` ("N d") is the closest
 * usable proxy: today minus N days, at midnight UTC since there's no
 * time-of-day component. This is a real approximation, not exact - it
 * under-states precision for same-day leads (speed-to-lead buckets <1h/1-4h
 * few resolve correctly against a day-granularity created_at) until Meritto
 * exposes a real timestamp field or the account admin adds one.
 */
function deriveCreatedAtFromLeadAge(leadAge: string | undefined): string {
  const match = leadAge?.match(/(\d+)\s*d/i);
  const days = match ? Number(match[1]) : 0;
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

export function transformLead(raw: MerittoLead): NormalizedMerittoLead {
  const attributionRaw: Record<string, unknown> = {
    source: raw.source ?? null,
    medium: raw.medium ?? null,
    campaign: raw.campaign ?? null,
    cf_ad_name: raw.cf_ad_name ?? null,
    cf_ad_set_name: raw.cf_ad_set_name ?? null,
    cf_campaign_name: raw.cf_campaign_name ?? null,
  };

  return {
    merittoLeadId: raw.lead_id,
    createdAtSource: deriveCreatedAtFromLeadAge(raw.lead_age),
    name: raw.name ?? null,
    email: raw.email ?? null,
    phone: raw.mobile ?? null,
    productCode: raw.course ?? null,
    source: normalizeSourceLabel(raw.source),
    campaign: raw.cf_campaign_name ?? raw.campaign ?? null,
    adSet: raw.cf_ad_set_name ?? null,
    creative: raw.cf_ad_name ?? null,
    attributionRaw,
    ownerRef: extractOwnerRef(raw.owner),
    sourceDisposition: raw.lead_stage ?? raw.lead_status ?? null,
    dqReason: null, // this account has no distinct DQ-reason field; disposition rules can still set one via lead_status_rules
    demoBookedAt: null, // no demo-tracking field in this account's schema (see getMetaData) - stays null until confirmed otherwise
    demoAttendedAt: null,
    raw,
  };
}

/**
 * A code is call-related if its name mentions "call" - this account's
 * activity taxonomy doesn't use a single clean "Call" category (spot-checked
 * live: real call codes are scattered across IVR/Missed/Communicate/
 * AI-Calling/Opportunity categories), so name matching is the reliable
 * signal. Within that set, a handful of explicit "missed/busy/not answered/
 * failed" names are the only clear negative signal this account's codes
 * expose - there's no explicit "connected/answered" positive code, so an
 * attempt is treated as connected unless one of those negative names says
 * otherwise. Best-effort heuristic, same style as dispositionIndicatesConnected
 * below - correct it via real call-outcome data if this proves too generous.
 *
 * "Contains 'call'" alone is too broad, though - live-verified against a Meritto
 * cross-check (this account's own `total_outbound` field on 5 real leads, 4/5 had our
 * call_attempts count higher). Root-caused to codes that mention "call" but aren't a
 * rep manually calling the lead: a callback *request* (lead asking to be called, not a call
 * happening), a bare settings toggle, inbound calls (the lead calling in - the opposite
 * direction from an outbound attempt), the AI auto-dialer (Mio AI), and automated IVR
 * campaign calls. Client's explicit call: Follow-up Depth should measure the sales team's own
 * manual outreach, so all of those are excluded here rather than counted as attempts.
 * Matched by category/name pattern (not this account's specific numeric codes), so this
 * should generalize to other Meritto accounts using the same taxonomy conventions.
 */
export function buildCallCodeIndex(codes: MerittoActivityCode[]): Map<string, 'connected' | 'missed'> {
  const index = new Map<string, 'connected' | 'missed'>();
  const missHints = ['missed', 'busy', 'not answered', 'failed', 'no answer'];
  const excludedNamePatterns = ['requested', 'inbound', 'campaign'];
  const excludedCategoryPatterns = ['configuration', 'ai-calling', 'inbound'];

  for (const c of codes) {
    const nameLower = c.name.toLowerCase();
    const categoryLower = c.category.toLowerCase();
    if (!nameLower.includes('call')) continue;
    if (excludedNamePatterns.some((p) => nameLower.includes(p))) continue;
    if (excludedCategoryPatterns.some((p) => categoryLower.includes(p))) continue;

    const isMiss = missHints.some((hint) => nameLower.includes(hint));
    index.set(String(c.code), isMiss ? 'missed' : 'connected');
  }

  return index;
}

export function transformActivity(raw: MerittoActivity, callCodeIndex: Map<string, 'connected' | 'missed'>): NormalizedMerittoActivity {
  const callOutcome = callCodeIndex.get(raw.activity_code);
  return {
    merittoActivityId: `${raw.lead_id}:${raw.activity_code}:${raw.created_on}`, // no dedicated activity id in this API - composite key is stable across re-syncs (same lead+code+timestamp), see upsertMerittoActivities's onConflict
    merittoLeadId: raw.lead_id,
    activityType: callOutcome ? 'call' : null,
    activityAt: new Date(raw.created_on * 1000).toISOString(),
    disposition: callOutcome ?? null,
    notes: raw.activity_performed ?? null,
    agent: null, // agent name is embedded in activity_performed free text ("Nitin [Operations] ..."), not a separate field - not worth parsing out yet
    raw,
  };
}

export function transformPayment(raw: MerittoPayment): NormalizedMerittoPayment {
  return {
    merittoPaymentId: raw.payment_id,
    merittoLeadId: raw.lead_id,
    amount: raw.amount,
    currency: raw.currency ?? 'INR',
    paidAt: raw.paid_at ?? null,
    paymentStatus: raw.status ?? null,
    raw,
  };
}

export interface CallActivitySummary {
  callAttempts: number;
  firstCallAt: string | null;
  connectAttempt: number | null;
  connected: boolean;
}

const CALL_ACTIVITY_TYPES = new Set(['call', 'phone_call', 'outbound_call']);
const CONNECTED_DISPOSITION_HINTS = ['connected', 'answered', 'talked'];
const NOT_CONNECTED_DISPOSITION_HINTS = [
  'not connected',
  'not answered',
  'no answer',
  'not reachable',
  'unreachable',
  'no response',
  'missed',
  'busy',
  'failed',
];

/** Substring matching alone would treat "Not Connected" as connected (it contains "connected") - negatives are checked first and win. */
function dispositionIndicatesConnected(disposition: string): boolean {
  const lower = disposition.toLowerCase();
  if (NOT_CONNECTED_DISPOSITION_HINTS.some((hint) => lower.includes(hint))) return false;
  return CONNECTED_DISPOSITION_HINTS.some((hint) => lower.includes(hint));
}

/**
 * Derives call_attempts / first_call_at / connect_attempt / connected from
 * the activity log, sorted chronologically. Pure function - the primary
 * "pagination handling / transformation" unit under test (see
 * tests/unit/transform/meritto.transform.test.ts).
 */
export function summarizeCallActivity(activities: NormalizedMerittoActivity[]): CallActivitySummary {
  const calls = activities
    .filter((a) => (a.activityType ? CALL_ACTIVITY_TYPES.has(a.activityType.toLowerCase()) : false))
    .sort((a, b) => new Date(a.activityAt).getTime() - new Date(b.activityAt).getTime());

  if (calls.length === 0) {
    return { callAttempts: 0, firstCallAt: null, connectAttempt: null, connected: false };
  }

  const firstConnectedIndex = calls.findIndex((c) => (c.disposition ? dispositionIndicatesConnected(c.disposition) : false));

  return {
    callAttempts: calls.length,
    firstCallAt: calls[0]!.activityAt,
    connectAttempt: firstConnectedIndex >= 0 ? firstConnectedIndex + 1 : null,
    connected: firstConnectedIndex >= 0,
  };
}
