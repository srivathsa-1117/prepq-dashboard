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

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('leads')
    .select('meritto_lead_id')
    .eq('client_id', clientId)
    .not('meritto_lead_id', 'is', null);
  if (existingError) throw existingError;
  const existingIds = new Set((existing ?? []).map((r) => r.meritto_lead_id));

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
