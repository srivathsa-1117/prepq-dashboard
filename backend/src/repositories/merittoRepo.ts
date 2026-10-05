import { supabaseAdmin } from '../database/supabaseClient.js';
import { upsertWithCounts, type UpsertCounts } from '../utils/upsertHelper.js';
import type { NormalizedMerittoLead, NormalizedMerittoPayment } from '../types/meritto.js';
import type { CallActivitySummary } from '../integrations/meritto/merittoTransform.js';
import type { DispositionResolution } from '../services/merittoDispositionMap.js';
import type { ResolvedAttribution } from './attributionLookupRepo.js';
import type { NormalizedMerittoActivity } from '../types/meritto.js';

export interface LeadUpsertInput {
  normalized: NormalizedMerittoLead;
  callSummary: CallActivitySummary;
  disposition: DispositionResolution;
  attribution: ResolvedAttribution;
  ownerId: string | null;
}

export async function upsertMerittoLeads(
  clientId: string,
  leads: LeadUpsertInput[],
): Promise<{ idByPlatformId: Map<string, string>; counts: UpsertCounts }> {
  if (leads.length === 0) return { idByPlatformId: new Map(), counts: { created: 0, updated: 0 } };

  // Paginated (not a single unbounded select): PostgREST silently caps an unranged select at
  // its default row limit (1000), and every lead for this client has a meritto_lead_id set, so
  // an unpaginated version here would have silently miscounted leads as "created" instead of
  // "updated" past the 1000th row once this account crossed that size - see reportingRepo.ts's
  // getEnrolledLeads for the same established pattern.
  const PAGE_SIZE = 1000;
  const existingIds = new Set<string>();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('leads')
      .select('meritto_lead_id')
      .eq('client_id', clientId)
      .not('meritto_lead_id', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1);
    if (existingError) throw existingError;
    for (const r of existing ?? []) existingIds.add(r.meritto_lead_id as string);
    if (!existing || existing.length < PAGE_SIZE) break;
  }

  // enrolled_at/fee_paid are deliberately NOT written here (or ever reset on re-sync): they're
  // set exactly once, out of band, by applyEnrollmentFromDisposition/applyEnrollmentFromPayments
  // below (guarded to only fill a currently-null value) or by a user's manual edit via the API -
  // this upsert running again on every scheduled sync must never clobber either.
  const rows = leads.map(({ normalized: l, callSummary, disposition, attribution, ownerId }) => ({
    client_id: clientId,
    meritto_lead_id: l.merittoLeadId,
    name: l.name,
    email: l.email,
    phone: l.phone,
    course_id: attribution.courseId,
    source: l.source,
    attribution_platform: attribution.attributionPlatform,
    meta_campaign_id: attribution.metaCampaignId,
    meta_adset_id: attribution.metaAdSetId,
    meta_ad_id: attribution.metaAdId,
    google_campaign_id: attribution.googleCampaignId,
    google_ad_group_id: attribution.googleAdGroupId,
    google_ad_id: attribution.googleAdId,
    creative_id: attribution.creativeId,
    owner_id: ownerId,
    first_call_at: callSummary.firstCallAt,
    call_attempts: callSummary.callAttempts,
    connect_attempt: callSummary.connectAttempt,
    connected: callSummary.connected,
    status: disposition.status,
    dq_reason: disposition.dqReason,
    demo_booked_at: l.demoBookedAt,
    demo_attended_at: l.demoAttendedAt,
    raw_data: l.raw as never,
    created_at: l.createdAtSource,
  }));

  const { data, error } = await supabaseAdmin
    .from('leads')
    .upsert(rows, { onConflict: 'client_id,meritto_lead_id' })
    .select('id, meritto_lead_id');
  if (error) throw error;

  const idByPlatformId = new Map((data ?? []).map((r) => [r.meritto_lead_id as string, r.id]));
  const created = leads.filter((l) => !existingIds.has(l.normalized.merittoLeadId)).length;
  return { idByPlatformId, counts: { created, updated: leads.length - created } };
}

export async function upsertMerittoActivities(
  clientId: string,
  activities: NormalizedMerittoActivity[],
  leadIdByPlatformId: Map<string, string>,
): Promise<UpsertCounts> {
  const rows = activities
    .map((a) => {
      const leadId = leadIdByPlatformId.get(a.merittoLeadId);
      if (!leadId) return null;
      return {
        client_id: clientId,
        lead_id: leadId,
        meritto_activity_id: a.merittoActivityId,
        // merittoTransform.ts sets activityType to null specifically to mean "not a call" -
        // defaulting that back to 'call' here mislabeled every non-call activity as a call in
        // the DB (didn't affect the dashboard, which counts from the already-correct in-memory
        // value via summarizeCallActivity, but corrupted the raw lead_activities data for anyone
        // querying it directly). activity_type is NOT NULL in the schema, so it still needs a
        // fallback - 'other' is honest about not knowing, unlike claiming it was a call.
        activity_type: a.activityType ?? 'other',
        activity_at: a.activityAt,
        outcome: a.disposition,
        notes: a.notes,
        raw_data: a.raw as never,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return { created: 0, updated: 0 };

  // Activities without a stable meritto_activity_id can't be safely upserted
  // (no natural key, per the unique index on lead_activities) - insert them
  // as new rows each sync and accept duplication risk over silent data loss;
  // ones with an id are idempotent.
  const withoutId = rows.filter((r) => r.meritto_activity_id === null);

  // Dedupe by (client_id, meritto_activity_id) before upserting: Postgres rejects an
  // upsert batch that hits the same ON CONFLICT target twice in one statement ("ON CONFLICT
  // DO UPDATE command cannot affect row a second time"). Live-tested, this account's 30-day
  // date-range windows (chunkIntoWindows in merittoClient.ts) can both return the activity
  // sitting exactly on a window boundary second, producing two rows with an identical
  // synthesized id (lead_id:activity_code:created_on) in the same batch.
  const withIdDeduped = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (row.meritto_activity_id === null) continue;
    withIdDeduped.set(`${row.client_id}:${row.meritto_activity_id}`, row);
  }
  const withId = [...withIdDeduped.values()];

  let created = 0;
  let updated = 0;

  if (withId.length > 0) {
    // Paginated past PostgREST's default 1000-row cap - this account already has 8,000+
    // activities, so an unpaginated read here was silently truncating and misreporting the
    // created/updated counts below (the upsert itself, further down, isn't affected by this).
    const SELECT_PAGE_SIZE = 1000;
    const existingIds = new Set<string>();
    for (let offset = 0; ; offset += SELECT_PAGE_SIZE) {
      const { data: existing, error: existingError } = await supabaseAdmin
        .from('lead_activities')
        .select('meritto_activity_id')
        .eq('client_id', clientId)
        .not('meritto_activity_id', 'is', null)
        .order('meritto_activity_id', { ascending: true })
        .range(offset, offset + SELECT_PAGE_SIZE - 1);
      if (existingError) throw existingError;
      for (const r of existing ?? []) {
        if (r.meritto_activity_id) existingIds.add(r.meritto_activity_id);
      }
      if (!existing || existing.length < SELECT_PAGE_SIZE) break;
    }

    const { error } = await supabaseAdmin.from('lead_activities').upsert(withId, { onConflict: 'client_id,meritto_activity_id' });
    if (error) throw error;

    // withId items always have a non-null meritto_activity_id (that's how withIdDeduped, above, was built).
    const newCount = withId.filter((r) => !existingIds.has(r.meritto_activity_id as string)).length;
    created += newCount;
    updated += withId.length - newCount;
  }

  if (withoutId.length > 0) {
    const { error } = await supabaseAdmin.from('lead_activities').insert(withoutId);
    if (error) throw error;
    created += withoutId.length;
  }

  return { created, updated };
}

/**
 * Full persisted call-activity history per lead (activity_type='call' rows from
 * lead_activities), keyed by meritto_lead_id so merittoSync.ts can merge it with the
 * current run's freshly-fetched window before computing call_attempts/first_call_at/
 * connect_attempt/connected. Without this, those fields were recomputed from ONLY the
 * in-window fetch on every scheduled sync - a lead last called before the reconciliation
 * window (default 30d) had its call history silently reset to "never called" the next
 * time the sync ran, even though the real activity rows stayed correctly in
 * lead_activities the whole time. Two full paginated scans (leads, then lead_activities),
 * not a per-lead or IN-clause query - this account already has 4,000+ leads and 20,000+
 * activities, well past what a single IN(...) clause or per-lead round-trip would handle
 * safely (see getCreativeFatigueRows in reportingRepo.ts for the same reasoning).
 */
const REPO_PAGE_SIZE = 1000;

/** Shared by getPersistedCallActivityHistory and getPersistedRegistrationTimestamps - both need to translate lead_activities' internal lead_id back to the raw meritto_lead_id the sync loop keys everything else by. */
async function getMerittoIdByLeadIdMap(clientId: string): Promise<Map<string, string>> {
  const merittoIdByLeadId = new Map<string, string>();
  for (let offset = 0; ; offset += REPO_PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select('id, meritto_lead_id')
      .eq('client_id', clientId)
      .not('meritto_lead_id', 'is', null)
      .range(offset, offset + REPO_PAGE_SIZE - 1);
    if (error) throw error;
    for (const r of data ?? []) merittoIdByLeadId.set(r.id, r.meritto_lead_id as string);
    if (!data || data.length < REPO_PAGE_SIZE) break;
  }
  return merittoIdByLeadId;
}

export async function getPersistedCallActivityHistory(
  clientId: string,
): Promise<Map<string, Array<{ merittoActivityId: string; activityAt: string; disposition: string | null }>>> {
  const merittoIdByLeadId = await getMerittoIdByLeadIdMap(clientId);

  const result = new Map<string, Array<{ merittoActivityId: string; activityAt: string; disposition: string | null }>>();
  for (let offset = 0; ; offset += REPO_PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('lead_activities')
      .select('lead_id, meritto_activity_id, activity_at, outcome')
      .eq('client_id', clientId)
      .eq('activity_type', 'call')
      .not('meritto_activity_id', 'is', null)
      .range(offset, offset + REPO_PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      const merittoLeadId = merittoIdByLeadId.get(row.lead_id);
      if (!merittoLeadId || !row.meritto_activity_id) continue;
      const list = result.get(merittoLeadId);
      const entry = { merittoActivityId: row.meritto_activity_id, activityAt: row.activity_at, disposition: row.outcome };
      if (list) list.push(entry);
      else result.set(merittoLeadId, [entry]);
    }
    if (!data || data.length < REPO_PAGE_SIZE) break;
  }

  return result;
}

/**
 * Earliest "Lead is Registered[...]" activity timestamp per lead (see buildRegistrationCodeIndex
 * in merittoTransform.ts), keyed by meritto_lead_id - Meritto's real per-lead registration
 * moment, timestamped to the second, vs. the whole-day lead_age approximation createdAtSource
 * otherwise falls back to. Same "persisted, not just this run's fetch window" reasoning as
 * getPersistedCallActivityHistory: an old lead's registration event may have synced weeks ago
 * and no longer be in the current reconciliation window's fresh fetch - live-confirmed only 31%
 * of leads older than 30 days would be covered without reading the persisted history too.
 * activity_code lives inside raw_data (jsonb), not its own column, so this filters client-side
 * after a full paginated scan rather than a server-side jsonb query - this account's ~21,000
 * activities is small enough that the extra transfer is cheap for a once-per-sync batch job.
 */
export async function getPersistedRegistrationTimestamps(clientId: string, registrationCodes: Set<string>): Promise<Map<string, string>> {
  if (registrationCodes.size === 0) return new Map();
  const merittoIdByLeadId = await getMerittoIdByLeadIdMap(clientId);

  const earliestByMerittoLeadId = new Map<string, string>();
  for (let offset = 0; ; offset += REPO_PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('lead_activities')
      .select('lead_id, activity_at, raw_data')
      .eq('client_id', clientId)
      .range(offset, offset + REPO_PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      const code = (row.raw_data as { activity_code?: unknown } | null)?.activity_code;
      if (code === undefined || !registrationCodes.has(String(code))) continue;
      const merittoLeadId = merittoIdByLeadId.get(row.lead_id);
      if (!merittoLeadId) continue;
      const existing = earliestByMerittoLeadId.get(merittoLeadId);
      if (!existing || row.activity_at < existing) earliestByMerittoLeadId.set(merittoLeadId, row.activity_at);
    }
    if (!data || data.length < REPO_PAGE_SIZE) break;
  }

  return earliestByMerittoLeadId;
}

export async function upsertMerittoPayments(
  clientId: string,
  payments: NormalizedMerittoPayment[],
  leadIdByPlatformId: Map<string, string>,
): Promise<{ counts: UpsertCounts; enrolledByLeadUuid: Map<string, { enrolledAt: string | null; feePaid: number }> }> {
  const enrolledByLeadUuid = new Map<string, { enrolledAt: string | null; feePaid: number }>();

  const rows = payments
    .map((p) => {
      const leadId = leadIdByPlatformId.get(p.merittoLeadId);
      if (!leadId) return null;

      const isSuccessful = !p.paymentStatus || ['success', 'paid', 'completed'].includes(p.paymentStatus.toLowerCase());
      if (isSuccessful) {
        const existingAgg = enrolledByLeadUuid.get(leadId);
        const feePaid = (existingAgg?.feePaid ?? 0) + p.amount;
        const enrolledAt = existingAgg?.enrolledAt && existingAgg.enrolledAt < (p.paidAt ?? '') ? existingAgg.enrolledAt : p.paidAt;
        enrolledByLeadUuid.set(leadId, { enrolledAt, feePaid });
      }

      return {
        client_id: clientId,
        lead_id: leadId,
        meritto_payment_id: p.merittoPaymentId,
        amount: p.amount,
        currency: p.currency,
        payment_date: p.paidAt,
        payment_status: isSuccessful ? 'success' : (p.paymentStatus ?? 'pending'),
        raw_data: p.raw as never,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const counts = await upsertWithCounts({
    table: 'payments',
    rows,
    onConflict: 'client_id,meritto_payment_id',
    keyColumns: ['client_id', 'meritto_payment_id'],
  });

  return { counts, enrolledByLeadUuid };
}

export async function applyEnrollmentFromPayments(
  enrolledByLeadUuid: Map<string, { enrolledAt: string | null; feePaid: number }>,
): Promise<void> {
  for (const [leadId, { enrolledAt, feePaid }] of enrolledByLeadUuid) {
    const { error } = await supabaseAdmin.from('leads').update({ enrolled_at: enrolledAt, fee_paid: feePaid }).eq('id', leadId);
    if (error) throw error;
  }
}

/**
 * This account doesn't use Meritto's Payments API (never wired up - see streamPayments), so
 * enrolled_at otherwise never gets set. Meritto's own lead_stage does carry a real "Enrolled"
 * value though - this fills enrolled_at from that signal instead. Guarded with `.is('enrolled_at',
 * null)` in the same query (not a read-then-write check) so it only ever fills a lead's *first*
 * observed enrollment and can never overwrite a value a user later edits manually, or that a
 * payments integration sets if one is ever wired up.
 */
export async function applyEnrollmentFromDisposition(enrolledAtByLeadUuid: Map<string, string>): Promise<void> {
  for (const [leadId, enrolledAt] of enrolledAtByLeadUuid) {
    const { error } = await supabaseAdmin.from('leads').update({ enrolled_at: enrolledAt }).eq('id', leadId).is('enrolled_at', null);
    if (error) throw error;
  }
}
