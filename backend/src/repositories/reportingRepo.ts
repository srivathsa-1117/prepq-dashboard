import { supabaseAdmin } from '../database/supabaseClient.js';
import { NotFoundError } from '../utils/errors.js';

/** Lead-centric row shape used by services/metricCalculations.ts - `owner` is denormalized from sales_reps.name for display. */
export interface LeadRow {
  id: string;
  created_at: string;
  course_id: string | null;
  source: string | null;
  status: string;
  dqReason: string | null;
  owner: string | null;
  first_call_at: string | null;
  call_attempts: number;
  connect_attempt: number | null;
  connected: boolean;
  demo_booked_at: string | null;
  demo_attended_at: string | null;
  enrolled_at: string | null;
  fee_paid: number | null;
}

export interface LeadQueryFilters {
  /** Already-resolved courses.id, not the course code - see services/reportingService.ts::resolveCourseId. */
  courseId?: string;
  source?: string;
  /** Already-resolved campaign uuid (meta_campaign_id or google_campaign_id, whichever matched) + which column it is. */
  campaignFilter?: { column: 'meta_campaign_id' | 'google_campaign_id'; id: string };
  creativeId?: string;
}

const LEAD_SELECT = `
  id, created_at, course_id, source, status, dq_reason, first_call_at, call_attempts,
  connect_attempt, connected, demo_booked_at, demo_attended_at, enrolled_at, fee_paid,
  sales_reps ( name )
`;

interface RawLeadRow {
  id: string;
  created_at: string;
  course_id: string | null;
  source: string | null;
  status: string;
  dq_reason: string | null;
  first_call_at: string | null;
  call_attempts: number;
  connect_attempt: number | null;
  connected: boolean;
  demo_booked_at: string | null;
  demo_attended_at: string | null;
  enrolled_at: string | null;
  fee_paid: number | null;
  sales_reps: { name: string } | { name: string }[] | null;
}

function toLeadRow(row: RawLeadRow): LeadRow {
  const salesRep = Array.isArray(row.sales_reps) ? row.sales_reps[0] : row.sales_reps;
  return {
    id: row.id,
    created_at: row.created_at,
    course_id: row.course_id,
    source: row.source,
    status: row.status,
    dqReason: row.dq_reason,
    owner: salesRep?.name ?? null,
    first_call_at: row.first_call_at,
    call_attempts: row.call_attempts,
    connect_attempt: row.connect_attempt,
    connected: row.connected,
    demo_booked_at: row.demo_booked_at,
    demo_attended_at: row.demo_attended_at,
    enrolled_at: row.enrolled_at,
    fee_paid: row.fee_paid,
  };
}

const LEADS_PAGE_SIZE = 1000;

/**
 * Pages through every row of a `leads` query, not a single `.select()`: live-tested, this
 * client's real lead volume (920+ and growing) sits right at PostgREST's default 1000-row
 * response cap - a single unpaginated query doesn't error when it's hit, it just silently
 * returns an arbitrary subset with no implicit ordering. Ordering by id keeps pages stable
 * across calls (created_at has ties at midnight for Meritto leads backfilled via lead_age, so
 * it alone isn't a safe pagination key - see merittoTransform.ts's deriveCreatedAtFromLeadAge).
 */
async function fetchAllLeadRows(buildQuery: () => ReturnType<typeof supabaseAdmin.from>): Promise<LeadRow[]> {
  const rows: RawLeadRow[] = [];
  for (let offset = 0; ; offset += LEADS_PAGE_SIZE) {
    // buildQuery()'s return type is ReturnType<typeof supabaseAdmin.from> (the bare, pre-filter
    // builder) as a stand-in for "some already-filtered PostgrestFilterBuilder" - the real type
    // varies per caller's .select() column list and isn't expressible generically here without
    // a lot more ceremony than this internal helper warrants.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (buildQuery() as any).order('id', { ascending: true }).range(offset, offset + LEADS_PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as RawLeadRow[]));
    if (!data || data.length < LEADS_PAGE_SIZE) break;
  }
  return rows.map(toLeadRow);
}

/** Leads created within [from, to] (inclusive, date-only) - the primary range-filtered dataset for most dashboard metrics. */
export async function getLeadsCreatedInRange(
  clientId: string,
  from: string,
  to: string,
  filters: LeadQueryFilters = {},
): Promise<LeadRow[]> {
  return fetchAllLeadRows(() => {
    let query = supabaseAdmin
      .from('leads')
      .select(LEAD_SELECT)
      .eq('client_id', clientId)
      .gte('created_at', `${from}T00:00:00.000Z`)
      .lte('created_at', `${to}T23:59:59.999Z`);

    if (filters.courseId) query = query.eq('course_id', filters.courseId);
    if (filters.source) query = query.eq('source', filters.source);
    if (filters.campaignFilter) query = query.eq(filters.campaignFilter.column, filters.campaignFilter.id);
    if (filters.creativeId) query = query.eq('creative_id', filters.creativeId);
    return query as unknown as ReturnType<typeof supabaseAdmin.from>;
  });
}

/**
 * Uncalled queue, scoped to leads created within [from, to] - same range as every other Sales-page
 * widget. Originally this was deliberately NOT range-filtered (an all-time live backlog per the
 * original spec), but that made "Uncalled" and "Assigned"/"Qualified" incomparable on the same
 * page: a team member could show far more "uncalled" (all-time) than "assigned" (range-filtered),
 * which read as a data bug rather than just two different time windows. Changed 2026-11-13 per the
 * client's own request to make Uncalled Aging and the Sales Team "uncalled" column respect the
 * page's date range like everything else does.
 */
export async function getUncalledLeads(clientId: string, from: string, to: string, filters: LeadQueryFilters = {}): Promise<LeadRow[]> {
  return fetchAllLeadRows(() => {
    let query = supabaseAdmin
      .from('leads')
      .select(LEAD_SELECT)
      .eq('client_id', clientId)
      .eq('call_attempts', 0)
      .gte('created_at', `${from}T00:00:00.000Z`)
      .lte('created_at', `${to}T23:59:59.999Z`);
    if (filters.courseId) query = query.eq('course_id', filters.courseId);
    if (filters.source) query = query.eq('source', filters.source);
    if (filters.campaignFilter) query = query.eq(filters.campaignFilter.column, filters.campaignFilter.id);
    if (filters.creativeId) query = query.eq('creative_id', filters.creativeId);
    return query as unknown as ReturnType<typeof supabaseAdmin.from>;
  });
}

/** All leads for cohort analysis - ignores the range filter by design (spec §15), scoped only by course/source. */
export async function getLeadsForCohort(clientId: string, filters: LeadQueryFilters = {}): Promise<LeadRow[]> {
  return fetchAllLeadRows(() => {
    let query = supabaseAdmin.from('leads').select(LEAD_SELECT).eq('client_id', clientId);
    if (filters.courseId) query = query.eq('course_id', filters.courseId);
    if (filters.source) query = query.eq('source', filters.source);
    if (filters.campaignFilter) query = query.eq(filters.campaignFilter.column, filters.campaignFilter.id);
    if (filters.creativeId) query = query.eq('creative_id', filters.creativeId);
    return query as unknown as ReturnType<typeof supabaseAdmin.from>;
  });
}

// ---------------------------------------------------------------------------
// Name -> id resolution for the campaign/creative/course filter params
// (spec §13). Applied once per request in services/reportingService.ts.
// ---------------------------------------------------------------------------

export async function resolveCourseId(clientId: string, code: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from('courses').select('id').eq('client_id', clientId).ilike('code', code).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function resolveCampaignFilter(
  clientId: string,
  name: string,
): Promise<{ column: 'meta_campaign_id' | 'google_campaign_id'; id: string } | null> {
  const [meta, google] = await Promise.all([
    supabaseAdmin.from('meta_campaigns').select('id').eq('client_id', clientId).ilike('name', name).maybeSingle(),
    supabaseAdmin.from('google_campaigns').select('id').eq('client_id', clientId).ilike('name', name).maybeSingle(),
  ]);
  if (meta.error) throw meta.error;
  if (google.error) throw google.error;
  if (meta.data) return { column: 'meta_campaign_id', id: meta.data.id };
  if (google.data) return { column: 'google_campaign_id', id: google.data.id };
  return null;
}

export async function resolveCreativeId(clientId: string, name: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from('creatives').select('id').eq('client_id', clientId).ilike('name', name).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

// ---------------------------------------------------------------------------
// Spend (v_ad_daily_unified / v_ads_unified, both already granted to
// service_role - see migrations 0023/0024 in the live project)
// ---------------------------------------------------------------------------

export interface SpendRow {
  date: string;
  platform: 'meta' | 'google';
  spend: number;
  impressions: number;
  clicks: number;
}

export async function getSpendInRange(
  clientId: string,
  from: string,
  to: string,
  filters: { platform?: 'meta' | 'google'; campaignName?: string } = {},
): Promise<SpendRow[]> {
  if (filters.campaignName) {
    let adQuery = supabaseAdmin.from('v_ads_unified').select('platform, ad_id').eq('client_id', clientId).ilike('campaign_name', filters.campaignName);
    if (filters.platform) adQuery = adQuery.eq('platform', filters.platform);
    const { data: ads, error: adsError } = await adQuery;
    if (adsError) throw adsError;
    if (!ads || ads.length === 0) return [];

    const results: SpendRow[] = [];
    for (const platform of ['meta', 'google'] as const) {
      const adIds = ads.filter((a) => a.platform === platform).map((a) => a.ad_id);
      if (adIds.length === 0) continue;
      const { data, error } = await supabaseAdmin
        .from('v_ad_daily_unified')
        .select('date, platform, spend, impressions, clicks')
        .eq('client_id', clientId)
        .in('ad_id', adIds)
        .gte('date', from)
        .lte('date', to);
      if (error) throw error;
      results.push(...((data ?? []) as SpendRow[]));
    }
    return results;
  }

  // Paginated, not a single .select(): live-tested, this account's real scale (~430 ads x up to
  // 90 days) puts a 30-day range alone at ~1,900 rows for this view - well past PostgREST's
  // default 1000-row response cap. An unpaginated query doesn't error, it just silently returns
  // an arbitrary ~1000-row subset (no implicit ordering), which showed up as the Overview trend
  // chart and headline spend KPI both going to 0 partway through the date range. Real bug, not
  // sparse data - the underlying daily_metrics tables have a row for every day.
  const PAGE_SIZE = 1000;
  const rows: SpendRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabaseAdmin
      .from('v_ad_daily_unified')
      .select('date, platform, spend, impressions, clicks')
      .eq('client_id', clientId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (filters.platform) query = query.eq('platform', filters.platform);

    const { data, error } = await query;
    if (error) throw error;
    rows.push(...((data ?? []) as SpendRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Date-ranged reporting functions (added specifically for this backend -
// see supabase migration backend_date_ranged_reporting_functions)
// ---------------------------------------------------------------------------

interface CampaignPerformanceRow {
  platform: string;
  campaign_id: string;
  campaign_name: string | null;
  status: string | null;
  course_code: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  qualified: number;
  enrolled: number;
  revenue: number;
}

/**
 * fn_campaign_performance_range splits a single campaign into one row per distinct daily status
 * it held during the date range (e.g. ACTIVE for the first half, PAUSED for the second) - live
 * confirmed: spend/impressions/clicks come from a day-level metrics join and ARE genuinely split
 * correctly per status-row, but leads/qualified/enrolled/revenue come from a separate
 * status-less leads subquery and are the SAME full-period total duplicated onto every split row
 * (not partial). Can't fix the SQL function itself right now (Supabase MCP access is down), so
 * this merges the split rows back into one per campaign here: sum the genuinely-split spend
 * fields, take the duplicated lead fields from just one row, and resolve status from the real
 * campaigns table (the RPC's own per-row status is a stale day-level snapshot, not "is this
 * campaign active right now").
 */
async function mergeSplitCampaignRows(clientId: string, rows: CampaignPerformanceRow[]): Promise<CampaignPerformanceRow[]> {
  const merged = new Map<string, CampaignPerformanceRow>();
  for (const row of rows) {
    const key = `${row.platform}:${row.campaign_id}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...row });
    } else {
      existing.spend = Number(existing.spend) + Number(row.spend);
      existing.impressions = Number(existing.impressions) + Number(row.impressions);
      existing.clicks = Number(existing.clicks) + Number(row.clicks);
    }
  }

  const result = [...merged.values()];
  if (result.length === 0) return result;

  const metaIds = result.filter((r) => r.platform === 'meta').map((r) => r.campaign_id);
  const googleIds = result.filter((r) => r.platform === 'google').map((r) => r.campaign_id);
  const [metaStatuses, googleStatuses] = await Promise.all([
    metaIds.length > 0
      ? supabaseAdmin.from('meta_campaigns').select('id, status').eq('client_id', clientId).in('id', metaIds)
      : Promise.resolve({ data: [], error: null }),
    googleIds.length > 0
      ? supabaseAdmin.from('google_campaigns').select('id, status').eq('client_id', clientId).in('id', googleIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (metaStatuses.error) throw metaStatuses.error;
  if (googleStatuses.error) throw googleStatuses.error;
  const currentStatusById = new Map<string, string>();
  for (const c of [...(metaStatuses.data ?? []), ...(googleStatuses.data ?? [])]) {
    if (c.status) currentStatusById.set(c.id, c.status);
  }

  for (const row of result) {
    row.status = currentStatusById.get(row.campaign_id) ?? row.status;
  }

  return result;
}

export async function getCampaignPerformance(
  clientId: string,
  from: string,
  to: string,
  filters: { platform?: string; courseId?: string; campaignId?: string } = {},
) {
  const { data, error } = await supabaseAdmin.rpc('fn_campaign_performance_range', {
    p_client_id: clientId,
    p_date_from: from,
    p_date_to: to,
    p_platform: filters.platform,
    p_course_id: filters.courseId,
    p_campaign_id: filters.campaignId,
  });
  if (error) throw error;
  return mergeSplitCampaignRows(clientId, (data ?? []) as CampaignPerformanceRow[]);
}

const ACTIVE_STATUSES = new Set(['ACTIVE', 'ENABLED']);

interface CreativePerformanceRow {
  creative_id: string;
  creative_name: string;
  thumbnail_url: string | null;
  asset_url: string | null;
  status: string | null;
  platform: string | null;
  campaign_name: string | null;
  adset_or_adgroup: string | null;
  course_code: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  qualified: number;
  junk: number;
  enrolled: number;
  revenue: number;
}

/**
 * fn_creative_performance_range reports a creative's own ad-level status only - Meta/Google both
 * let an individual ad stay "ACTIVE"/"ENABLED" while its parent ad set or campaign is paused
 * (confirmed live: 139 of this account's 433 meta ads are ACTIVE with a PAUSED parent campaign
 * and/or ad set), so the dashboard was showing creatives as live that aren't actually delivering
 * anything. Per the client's explicit request: if anything above the ad in the hierarchy is off,
 * the creative should not read as live. Can't fix fn_creative_performance_range itself right now
 * (Supabase MCP access is down), so this resolves the real ad->adset/ad group->campaign chain
 * here and overrides status with whichever level is actually blocking delivery.
 */
async function resolveEffectiveCreativeStatus<T extends CreativePerformanceRow>(clientId: string, rows: T[]): Promise<T[]> {
  if (rows.length === 0) return rows;

  const { data: creativeAds, error: caErr } = await supabaseAdmin
    .from('creative_ads')
    .select('creative_id, platform, meta_ad_id, google_ad_id')
    .eq('client_id', clientId);
  if (caErr) throw caErr;

  const metaAdIdByCreative = new Map<string, string>();
  const googleAdIdByCreative = new Map<string, string>();
  for (const ca of creativeAds ?? []) {
    if (ca.meta_ad_id) metaAdIdByCreative.set(ca.creative_id, ca.meta_ad_id);
    if (ca.google_ad_id) googleAdIdByCreative.set(ca.creative_id, ca.google_ad_id);
  }

  const [metaAds, googleAds, metaCampaigns, metaAdsets, googleCampaigns, googleAdGroups] = await Promise.all([
    supabaseAdmin.from('meta_ads').select('id, status, campaign_id, adset_id').eq('client_id', clientId),
    supabaseAdmin.from('google_ads').select('id, status, campaign_id, ad_group_id').eq('client_id', clientId),
    supabaseAdmin.from('meta_campaigns').select('id, status').eq('client_id', clientId),
    supabaseAdmin.from('meta_adsets').select('id, status').eq('client_id', clientId),
    supabaseAdmin.from('google_campaigns').select('id, status').eq('client_id', clientId),
    supabaseAdmin.from('google_ad_groups').select('id, status').eq('client_id', clientId),
  ]);
  for (const r of [metaAds, googleAds, metaCampaigns, metaAdsets, googleCampaigns, googleAdGroups]) {
    if (r.error) throw r.error;
  }

  const metaCampaignStatus = new Map((metaCampaigns.data ?? []).map((c) => [c.id, c.status]));
  const metaAdsetStatus = new Map((metaAdsets.data ?? []).map((a) => [a.id, a.status]));
  const googleCampaignStatus = new Map((googleCampaigns.data ?? []).map((c) => [c.id, c.status]));
  const googleAdGroupStatus = new Map((googleAdGroups.data ?? []).map((g) => [g.id, g.status]));
  const metaAdById = new Map((metaAds.data ?? []).map((a) => [a.id, a]));
  const googleAdById = new Map((googleAds.data ?? []).map((a) => [a.id, a]));

  const isActive = (status: string | null | undefined) => !!status && ACTIVE_STATUSES.has(status);

  return rows.map((row) => {
    if (row.platform === 'meta') {
      const adId = metaAdIdByCreative.get(row.creative_id);
      const ad = adId ? metaAdById.get(adId) : undefined;
      if (!ad) return row;
      const campaignStatus = ad.campaign_id ? metaCampaignStatus.get(ad.campaign_id) : undefined;
      const adsetStatus = ad.adset_id ? metaAdsetStatus.get(ad.adset_id) : undefined;
      // Downgrade to the RPC's own 'paused' vocabulary (not the raw ACTIVE/PAUSED/ENABLED string)
      // so the frontend's creativeStatus.ts label/variant lookup (which only knows
      // draft/ready/active/paused/archived) still renders correctly instead of falling through
      // to an unrecognized raw value.
      if (!isActive(campaignStatus) || !isActive(adsetStatus)) return { ...row, status: 'paused' };
      return row;
    }
    if (row.platform === 'google') {
      const adId = googleAdIdByCreative.get(row.creative_id);
      const ad = adId ? googleAdById.get(adId) : undefined;
      if (!ad) return row;
      const campaignStatus = ad.campaign_id ? googleCampaignStatus.get(ad.campaign_id) : undefined;
      const adGroupStatus = ad.ad_group_id ? googleAdGroupStatus.get(ad.ad_group_id) : undefined;
      if (!isActive(campaignStatus) || !isActive(adGroupStatus)) return { ...row, status: 'paused' };
      return row;
    }
    return row;
  });
}

export async function getCreativePerformance(
  clientId: string,
  from: string,
  to: string,
  filters: { platform?: string; courseId?: string } = {},
) {
  const { data, error } = await supabaseAdmin.rpc('fn_creative_performance_range', {
    p_client_id: clientId,
    p_date_from: from,
    p_date_to: to,
    p_platform: filters.platform,
    p_course_id: filters.courseId,
  });
  if (error) throw error;
  return resolveEffectiveCreativeStatus(clientId, (data ?? []) as CreativePerformanceRow[]);
}

export async function getSourcePerformance(clientId: string, from: string, to: string, courseId?: string) {
  const { data, error } = await supabaseAdmin.rpc('fn_source_performance_range', {
    p_client_id: clientId,
    p_date_from: from,
    p_date_to: to,
    p_course_id: courseId,
  });
  if (error) throw error;
  return data ?? [];
}

/**
 * Fatigue is always "as of now" (trailing 14d vs preceding 14d), independent of the dashboard's
 * date-range filter - sourced from the live project's own v_creative_performance view.
 *
 * Scoped by client_id alone, not also `.not('creative_id', 'is', null)` - the view is already
 * client-scoped, so that filter was redundant, and live-tested, an .in() with this client's real
 * ad volume (400+ ids) builds a URL long enough to fail at the connection level. The caller just
 * does map.get(id) per creative, so a few unused extra rows in the map are harmless.
 */
export async function getCreativeFatigueRows(clientId: string, creativeIds: string[]) {
  if (creativeIds.length === 0) return [];
  const { data, error } = await supabaseAdmin.from('v_creative_performance').select('creative_id, fatigue_status, fatigue_change_pp').eq('client_id', clientId);
  if (error) throw error;
  return data ?? [];
}

export async function getTargetsForMonth(clientId: string, month: string) {
  const { data, error } = await supabaseAdmin
    .from('targets')
    .select('id, course_id, month, lead_target, qualified_target, enrollment_target, revenue_target')
    .eq('client_id', clientId)
    .eq('month', month);
  if (error) throw error;
  return data ?? [];
}

export interface TargetInput {
  courseId: string;
  leadTarget: number;
  qualifiedTarget: number;
  enrollmentTarget: number;
  revenueTarget: number;
}

/** Upserts one client's targets for a given month, one row per course - `month` must be the first of the month (DB check constraint). */
export async function upsertTargetsForMonth(clientId: string, month: string, targets: TargetInput[]): Promise<void> {
  if (targets.length === 0) return;
  const rows = targets.map((t) => ({
    client_id: clientId,
    course_id: t.courseId,
    month,
    lead_target: t.leadTarget,
    qualified_target: t.qualifiedTarget,
    enrollment_target: t.enrollmentTarget,
    revenue_target: t.revenueTarget,
  }));
  const { error } = await supabaseAdmin.from('targets').upsert(rows, { onConflict: 'client_id,course_id,month' });
  if (error) throw error;
}

export interface EnrolledLeadRow {
  id: string;
  name: string | null;
  courseId: string | null;
  enrolledAt: string;
  feePaid: number | null;
}

/**
 * Leads enrolled_at !== null - the account doesn't use Meritto's Payments API (see
 * merittoSync.ts), so fee_paid never gets set automatically and is entered manually here
 * instead. Ordered most-recently-enrolled first since that's what a user editing revenue
 * will want to find.
 */
export async function getEnrolledLeads(clientId: string): Promise<EnrolledLeadRow[]> {
  const PAGE_SIZE = 1000;
  const rows: EnrolledLeadRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select('id, name, course_id, enrolled_at, fee_paid')
      .eq('client_id', clientId)
      .not('enrolled_at', 'is', null)
      .order('enrolled_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    for (const r of data ?? []) {
      rows.push({ id: r.id, name: r.name, courseId: r.course_id, enrolledAt: r.enrolled_at as string, feePaid: r.fee_paid });
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

/** Manual revenue entry - see getEnrolledLeads. Scoped by client_id so a lead from another client can never be targeted even with a guessed id. */
export async function updateLeadFeePaid(clientId: string, leadId: string, feePaid: number): Promise<void> {
  const { error, count } = await supabaseAdmin
    .from('leads')
    .update({ fee_paid: feePaid }, { count: 'exact' })
    .eq('client_id', clientId)
    .eq('id', leadId);
  if (error) throw error;
  if (!count) throw new NotFoundError('Lead not found for this client');
}

/**
 * Manual course assignment - for the ~98% of this account's leads where Meritto's own `course`
 * field is blank (confirmed live: 958/980), there's no attribution source to derive this from
 * automatically, so a human fills it in. Once set, every course-scoped number (Revenue by
 * course, course-fee-fallback revenue/ROAS, CourseFilter) picks it up immediately - they all key
 * off this same `leads.course_id` column, no separate wiring needed. courseId is validated
 * against this client's own `courses` (not just any UUID) before writing, same trust boundary as
 * updateLeadFeePaid's client_id scoping.
 */
export async function updateLeadCourse(clientId: string, leadId: string, courseId: string): Promise<void> {
  const { data: course, error: courseError } = await supabaseAdmin.from('courses').select('id').eq('client_id', clientId).eq('id', courseId).maybeSingle();
  if (courseError) throw courseError;
  if (!course) throw new NotFoundError('Course not found for this client');

  const { error, count } = await supabaseAdmin
    .from('leads')
    .update({ course_id: courseId }, { count: 'exact' })
    .eq('client_id', clientId)
    .eq('id', leadId);
  if (error) throw error;
  if (!count) throw new NotFoundError('Lead not found for this client');
}

export async function getCourseFees(clientId: string) {
  const { data, error } = await supabaseAdmin.from('courses').select('id, code, name, fee').eq('client_id', clientId);
  if (error) throw error;
  return data ?? [];
}

export interface LeadDetailRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  dqReason: string | null;
  source: string | null;
  courseId: string | null;
  owner: string | null;
  createdAt: string;
  firstCallAt: string | null;
  callAttempts: number;
  connectAttempt: number | null;
  connected: boolean;
  demoBookedAt: string | null;
  demoAttendedAt: string | null;
  enrolledAt: string | null;
  feePaid: number | null;
}

/** Scoped by client_id so a lead from another client can never be viewed even with a guessed id - same trust boundary as updateLeadFeePaid. */
export async function getLeadDetail(clientId: string, leadId: string): Promise<LeadDetailRow> {
  const { data, error } = await supabaseAdmin
    .from('leads')
    .select(
      'id, name, email, phone, status, dq_reason, source, course_id, created_at, first_call_at, call_attempts, connect_attempt, connected, demo_booked_at, demo_attended_at, enrolled_at, fee_paid, sales_reps ( name )',
    )
    .eq('client_id', clientId)
    .eq('id', leadId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError('Lead not found for this client');

  const salesRep = Array.isArray(data.sales_reps) ? data.sales_reps[0] : data.sales_reps;
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    phone: data.phone,
    status: data.status,
    dqReason: data.dq_reason,
    source: data.source,
    courseId: data.course_id,
    owner: salesRep?.name ?? null,
    createdAt: data.created_at,
    firstCallAt: data.first_call_at,
    callAttempts: data.call_attempts,
    connectAttempt: data.connect_attempt,
    connected: data.connected,
    demoBookedAt: data.demo_booked_at,
    demoAttendedAt: data.demo_attended_at,
    enrolledAt: data.enrolled_at,
    feePaid: data.fee_paid,
  };
}

export interface LeadActivityRow {
  id: string;
  activityType: string;
  activityAt: string;
  outcome: string | null;
  notes: string | null;
  duration: number | null;
  owner: string | null;
}

/** Chronological (oldest first) so the timeline reads top-to-bottom in the order events actually happened, independent of however Meritto's own UI sorts them. */
export async function getLeadActivities(clientId: string, leadId: string): Promise<LeadActivityRow[]> {
  const { data, error } = await supabaseAdmin
    .from('lead_activities')
    .select('id, activity_type, activity_at, outcome, notes, duration, sales_reps ( name )')
    .eq('client_id', clientId)
    .eq('lead_id', leadId)
    .order('activity_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const salesRep = Array.isArray(row.sales_reps) ? row.sales_reps[0] : row.sales_reps;
    return {
      id: row.id,
      activityType: row.activity_type,
      activityAt: row.activity_at,
      outcome: row.outcome,
      notes: row.notes,
      duration: row.duration,
      owner: salesRep?.name ?? null,
    };
  });
}

/**
 * Every distinct `leads.source` value for this client - paginated (not a single unbounded
 * select) because PostgREST silently caps an unranged select at its default row limit (1000).
 * With this account alone past 3,000 leads, an unpaginated version was confirmed live to
 * silently drop rarer sources (e.g. "national ea webhinar") from the filter dropdown entirely -
 * not an error, just missing options, so it went unnoticed until checked directly.
 */
async function getDistinctSources(clientId: string): Promise<string[]> {
  const PAGE_SIZE = 1000;
  const sources = new Set<string>();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select('source')
      .eq('client_id', clientId)
      .not('source', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data ?? []) sources.add(row.source as string);
    if (!data || data.length < PAGE_SIZE) break;
  }
  return Array.from(sources).sort();
}

/**
 * Powers CourseFilter/SourceFilter option lists - courses are the client's canonical list, sources
 * are distinct values actually seen on leads (never a hardcoded list, since source taxonomy is
 * client-configured).
 *
 * `status = 'active'` excludes the Online/Offline fee-reference rows (e.g. "EA Online", "EA
 * Offline") added 2026-11-13 for mode-aware revenue - those exist purely so the correct fee is
 * looked up at enrollment time (see attributionLookupRepo.ts's modeFeeByCode), and are never a
 * real lead's course_id, so they must never appear as a pickable course here or in the
 * course-assignment dropdown (EnrolledLeadsRevenue.tsx), which both read this same list.
 */
export async function getFilterOptions(clientId: string) {
  const [coursesResult, sources] = await Promise.all([
    supabaseAdmin.from('courses').select('id, code, name').eq('client_id', clientId).eq('status', 'active').order('name'),
    getDistinctSources(clientId),
  ]);
  if (coursesResult.error) throw coursesResult.error;

  return { courses: coursesResult.data ?? [], sources };
}

// ---------------------------------------------------------------------------
// Campaign drilldown (GET /api/dashboard/campaigns/:campaignId)
// ---------------------------------------------------------------------------

export async function getCampaignDailyTrend(clientId: string, platform: 'meta' | 'google', campaignId: string, from: string, to: string) {
  const { data, error } = await supabaseAdmin.rpc('fn_campaign_daily_trend', {
    p_client_id: clientId,
    p_platform: platform,
    p_campaign_id: campaignId,
    p_date_from: from,
    p_date_to: to,
  });
  if (error) throw error;
  return data ?? [];
}

export async function getCampaignAdGroups(clientId: string, platform: 'meta' | 'google', campaignId: string, from: string, to: string) {
  const { data, error } = await supabaseAdmin.rpc('fn_campaign_adgroups', {
    p_client_id: clientId,
    p_platform: platform,
    p_campaign_id: campaignId,
    p_date_from: from,
    p_date_to: to,
  });
  if (error) throw error;
  return data ?? [];
}

export async function getCampaignAds(clientId: string, platform: 'meta' | 'google', campaignId: string, from: string, to: string) {
  const { data, error } = await supabaseAdmin.rpc('fn_campaign_ads', {
    p_client_id: clientId,
    p_platform: platform,
    p_campaign_id: campaignId,
    p_date_from: from,
    p_date_to: to,
  });
  if (error) throw error;
  return data ?? [];
}

/**
 * Enrolled lead count per ad, scoped by created_at in [from, to] - fn_campaign_ads doesn't
 * compute this today, so it's derived directly from leads here instead of touching that SQL
 * function (same application-layer approach already used for the campaign-status-hierarchy and
 * campaign-row-merge fixes). adIds are already-resolved internal meta_ads.id/google_ads.id values
 * (leads.meta_ad_id/google_ad_id's FK target), matching what fn_campaign_ads itself returns as
 * ad_id, so no extra lookup is needed to line them up.
 *
 * Deliberately does NOT filter the query by `.in(column, adIds)` - adIds is only used for the
 * empty-input short-circuit above and is otherwise just the caller's lookup key set. Real bug hit
 * live: the creative-level sibling of this function (getNotReachableCountByCreative) did filter by
 * id list, and with this account's 534 creatives that produced a ~20,000-character IN-list that
 * PostgREST's GET request couldn't carry, failing every request with an opaque "fetch failed" (no
 * HTTP status, since the request itself couldn't be sent) and breaking the entire Creatives page.
 * adIds here is bounded per-campaign today and wouldn't hit that limit yet, but there's no reason
 * to carry the same latent landmine - scanning by date+status without restricting to specific ids
 * is just as correct (callers only ever do `.get(id) ?? 0`) and has no id-count ceiling.
 */
export async function getEnrolledCountByAdId(
  clientId: string,
  platform: 'meta' | 'google',
  adIds: string[],
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (adIds.length === 0) return counts;

  const column = platform === 'meta' ? 'meta_ad_id' : 'google_ad_id';
  const PAGE_SIZE = 1000;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select(column)
      .eq('client_id', clientId)
      .not(column, 'is', null)
      .gte('created_at', `${from}T00:00:00.000Z`)
      .lte('created_at', `${to}T23:59:59.999Z`)
      .not('enrolled_at', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of (data ?? []) as Array<Record<string, string | null>>) {
      const adId = row[column];
      if (!adId) continue;
      counts.set(adId, (counts.get(adId) ?? 0) + 1);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return counts;
}

/**
 * "No Response" count per campaign, scoped by created_at in [from, to] - fn_campaign_performance_range
 * has no not_reachable breakdown today, so it's derived directly from leads here, same
 * application-layer approach (and exact structure) as getEnrolledCountByAdId above. campaignIds are
 * the internal meta_campaigns.id/google_campaigns.id values the campaign RPCs already return,
 * matching leads.meta_campaign_id/google_campaign_id's FK target.
 *
 * No `.in(column, campaignIds)` filter, same reasoning as getEnrolledCountByAdId's doc comment -
 * campaignIds is only the empty-input short-circuit + the caller's lookup keys. Campaign counts are
 * small enough today that this specific function never hit the URL-length failure live, but it's
 * the same landmine, so fixed the same way rather than leaving it for a bigger account to trip.
 */
export async function getNotReachableCountByCampaign(
  clientId: string,
  platform: 'meta' | 'google',
  campaignIds: string[],
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (campaignIds.length === 0) return counts;

  const column = platform === 'meta' ? 'meta_campaign_id' : 'google_campaign_id';
  const PAGE_SIZE = 1000;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select(column)
      .eq('client_id', clientId)
      .not(column, 'is', null)
      .eq('status', 'not_reachable')
      .gte('created_at', `${from}T00:00:00.000Z`)
      .lte('created_at', `${to}T23:59:59.999Z`)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of (data ?? []) as Array<Record<string, string | null>>) {
      const campaignId = row[column];
      if (!campaignId) continue;
      counts.set(campaignId, (counts.get(campaignId) ?? 0) + 1);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return counts;
}

/**
 * Same as getNotReachableCountByCampaign, but per creative - leads.creative_id is a single
 * platform-agnostic column (no meta/google split needed, unlike campaign/ad ids).
 *
 * No `.not('creative_id', 'is', null)` filter - this is the function that actually broke the
 * Creatives page live: this account has 534 creatives, and a ~20,000-character IN-list in the
 * query URL made every request fail with a generic "fetch failed" (PostgREST couldn't even receive
 * the GET request, so there was no HTTP status to surface). See getEnrolledCountByAdId's doc
 * comment for the full writeup - same fix, scan by date+status only and let callers look up by id.
 */
export async function getNotReachableCountByCreative(
  clientId: string,
  creativeIds: string[],
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (creativeIds.length === 0) return counts;

  const PAGE_SIZE = 1000;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select('creative_id')
      .eq('client_id', clientId)
      .not('creative_id', 'is', null)
      .eq('status', 'not_reachable')
      .gte('created_at', `${from}T00:00:00.000Z`)
      .lte('created_at', `${to}T23:59:59.999Z`)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      if (!row.creative_id) continue;
      counts.set(row.creative_id, (counts.get(row.creative_id) ?? 0) + 1);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return counts;
}

export async function getCampaignCreatives(clientId: string, platform: 'meta' | 'google', campaignId: string, from: string, to: string) {
  const { data, error } = await supabaseAdmin.rpc('fn_campaign_creatives', {
    p_client_id: clientId,
    p_platform: platform,
    p_campaign_id: campaignId,
    p_date_from: from,
    p_date_to: to,
  });
  if (error) throw error;
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Creative drilldown (GET /api/dashboard/creatives/:creativeId)
// ---------------------------------------------------------------------------

export interface CreativeLibraryInfo {
  id: string;
  name: string;
  internalName: string | null;
  concept: string | null;
  hook: string | null;
  angle: string | null;
  format: string | null;
  status: string;
  assetUrl: string | null;
  thumbnailUrl: string | null;
  /** Carousel card images, in order - null/empty for a single-image or video creative. */
  carouselImages: string[] | null;
  createdAt: string;
  /** From creative_ads - a creative can be mapped to at most one Meta ad and one Google ad. */
  mappings: Array<{ platform: 'meta' | 'google'; adId: string | null; adName: string | null; campaignName: string | null; adsetOrAdgroupName: string | null }>;
}

export async function getCreativeLibraryInfo(clientId: string, creativeId: string): Promise<CreativeLibraryInfo | null> {
  const { data: creative, error } = await supabaseAdmin
    .from('creatives')
    .select('id, name, internal_name, concept, hook, angle, format, status, asset_url, thumbnail_url, carousel_images, created_at')
    .eq('client_id', clientId)
    .eq('id', creativeId)
    .maybeSingle();
  if (error) throw error;
  if (!creative) return null;

  const { data: mappingRows, error: mappingError } = await supabaseAdmin
    .from('creative_ads')
    .select('platform, meta_ad_id, google_ad_id')
    .eq('client_id', clientId)
    .eq('creative_id', creativeId);
  if (mappingError) throw mappingError;

  const mappings = await Promise.all(
    (mappingRows ?? []).map(async (m) => {
      const adId = m.meta_ad_id ?? m.google_ad_id;
      if (!adId) return { platform: m.platform as 'meta' | 'google', adId: null, adName: null, campaignName: null, adsetOrAdgroupName: null };

      const { data: adRow } = await supabaseAdmin
        .from('v_ads_unified')
        .select('ad_name, campaign_name, adset_name')
        .eq('client_id', clientId)
        .eq('platform', m.platform)
        .eq('ad_id', adId)
        .maybeSingle();

      return {
        platform: m.platform as 'meta' | 'google',
        adId,
        adName: adRow?.ad_name ?? null,
        campaignName: adRow?.campaign_name ?? null,
        adsetOrAdgroupName: adRow?.adset_name ?? null,
      };
    }),
  );

  return {
    id: creative.id,
    name: creative.name,
    internalName: creative.internal_name,
    concept: creative.concept,
    hook: creative.hook,
    angle: creative.angle,
    format: creative.format,
    status: creative.status,
    assetUrl: creative.asset_url,
    thumbnailUrl: creative.thumbnail_url,
    carouselImages: (creative.carousel_images as string[] | null) ?? null,
    createdAt: creative.created_at,
    mappings,
  };
}

export async function getCreativeDailyTrend(clientId: string, creativeId: string, from: string, to: string) {
  const { data, error } = await supabaseAdmin.rpc('fn_creative_daily_trend', {
    p_client_id: clientId,
    p_creative_id: creativeId,
    p_date_from: from,
    p_date_to: to,
  });
  if (error) throw error;
  return data ?? [];
}

/** Raw counts for the two 14-day fatigue windows, for the creative detail drawer's fatigue breakdown (the grid uses the precomputed v_creative_performance status instead - see services/fatigueService.ts). */
export async function getLeadCountsInWindow(clientId: string, creativeId: string, from: string, to: string): Promise<{ leads: number; qualified: number }> {
  const { count: leads, error: leadsError } = await supabaseAdmin
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('creative_id', creativeId)
    .gte('created_at', `${from}T00:00:00.000Z`)
    .lte('created_at', `${to}T23:59:59.999Z`);
  if (leadsError) throw leadsError;

  const { count: qualified, error: qualifiedError } = await supabaseAdmin
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('creative_id', creativeId)
    .eq('status', 'qualified')
    .gte('created_at', `${from}T00:00:00.000Z`)
    .lte('created_at', `${to}T23:59:59.999Z`);
  if (qualifiedError) throw qualifiedError;

  return { leads: leads ?? 0, qualified: qualified ?? 0 };
}
