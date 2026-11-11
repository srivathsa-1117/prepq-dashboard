import {
  getLeadsCreatedInRange,
  getUncalledLeads,
  getLeadsForCohort,
  getSpendInRange,
  resolveCourseId,
  resolveCampaignFilter,
  resolveCreativeId,
  getCampaignPerformance as getCampaignPerformanceRepo,
  getCreativePerformance as getCreativePerformanceRepo,
  getSourcePerformance as getSourcePerformanceRepo,
  getTargetsForMonth,
  upsertTargetsForMonth,
  getEnrolledLeads,
  updateLeadFeePaid,
  updateLeadCourse,
  getLeadDetail,
  getLeadActivities,
  type TargetInput,
  getCourseFees,
  getCampaignDailyTrend,
  getCampaignAdGroups,
  getCampaignAds,
  getEnrolledCountByAdId,
  getNotReachableCountByCampaign,
  getNotReachableCountByCreative,
  getCampaignCreatives,
  getCreativeLibraryInfo,
  getCreativeDailyTrend,
  getFilterOptions as getFilterOptionsRepo,
  type LeadRow,
  type LeadQueryFilters,
  type SpendRow,
} from '../repositories/reportingRepo.js';
import { getClientById } from '../repositories/clientsRepo.js';
import { getCreativeFatigueMap, getCreativeFatigueDetail } from './fatigueService.js';
import * as calc from './metricCalculations.js';
import { resolveDateRange, previousEqualPeriod, currentMonthPacing, dayKey, type DateRange } from '../utils/dateRanges.js';
import type { DateRangePreset } from '../config/constants.js';
import { NotFoundError } from '../utils/errors.js';

export interface ReportingFilters extends LeadQueryFilters {}

/**
 * asset_url is preferred over the 64x64 thumbnail_url crop for a real preview - except when
 * asset_url is a Facebook video-embed iframe URL (MetaClient.fetchVideoSources's fallback for
 * Reels-format ad videos, which have no raw file exposed at this token's level): the grid shows
 * many cards at once and only ever renders <img>, not an iframe, so an embed URL there would
 * just be a broken image. thumbnail_url (a real static frame) is the right preview for that case;
 * the detail drawer still gets the real embed via assetUrl directly, where AssetPreview's
 * playableVideo mode renders it as an iframe.
 */
function pickGridPreviewUrl(assetUrl: string | null, thumbnailUrl: string | null): string | null {
  if (assetUrl && !assetUrl.includes('facebook.com/plugins/video.php')) return assetUrl;
  return thumbnailUrl;
}

export interface ResolvedRequest {
  clientId: string;
  timezone: string;
  range: DateRange;
  filters: ReportingFilters;
  /** Raw (unresolved) filter inputs, for the SQL functions that take a platform/course_id directly rather than the pre-joined LeadQueryFilters shape. */
  rawFilters: { source?: string; course?: string };
}

/**
 * Shared resolution: loads the client (for timezone), resolves the date
 * range, and resolves the course/campaign/creative NAME filters (spec §13)
 * to the real foreign keys this schema's `leads` table actually stores -
 * every dashboard route calls this first.
 */
export async function resolveRequest(input: {
  clientId: string;
  range?: DateRangePreset;
  dateFrom?: string;
  dateTo?: string;
  course?: string;
  source?: string;
  campaign?: string;
  creative?: string;
}): Promise<ResolvedRequest> {
  const client = await getClientById(input.clientId);
  if (!client) throw new NotFoundError('Client not found');

  const range: DateRange =
    input.dateFrom && input.dateTo ? { from: input.dateFrom, to: input.dateTo } : resolveDateRange(input.range ?? '30d', client.timezone);

  const [courseId, campaignFilter, creativeId] = await Promise.all([
    input.course ? resolveCourseId(input.clientId, input.course) : Promise.resolve(undefined),
    input.campaign ? resolveCampaignFilter(input.clientId, input.campaign) : Promise.resolve(undefined),
    input.creative ? resolveCreativeId(input.clientId, input.creative) : Promise.resolve(undefined),
  ]);

  return {
    clientId: input.clientId,
    timezone: client.timezone,
    range,
    filters: {
      courseId: courseId ?? undefined,
      source: input.source,
      campaignFilter: campaignFilter ?? undefined,
      creativeId: creativeId ?? undefined,
    },
    rawFilters: { source: input.source, course: input.course },
  };
}

async function feeMapFor(clientId: string): Promise<Map<string, number>> {
  const fees = await getCourseFees(clientId);
  return new Map(fees.map((f) => [f.id, f.fee]));
}

function sumEnrolledRevenue(leads: LeadRow[], feeMap: Map<string, number>): number {
  return leads
    .filter((l) => l.enrolled_at !== null)
    .reduce((sum, l) => sum + calc.effectiveFee(l.fee_paid, l.course_id ? feeMap.get(l.course_id) : undefined), 0);
}

function sumSpend(rows: SpendRow[]): { spend: number; impressions: number; clicks: number } {
  return rows.reduce(
    (acc, r) => ({ spend: acc.spend + Number(r.spend), impressions: acc.impressions + Number(r.impressions), clicks: acc.clicks + Number(r.clicks) }),
    { spend: 0, impressions: 0, clicks: 0 },
  );
}

function spendFilterFor(req: ResolvedRequest): { platform?: 'meta' | 'google' } {
  const source = req.rawFilters.source?.toLowerCase();
  return { platform: source === 'meta' || source === 'google' ? source : undefined };
}

// ---------------------------------------------------------------------------
// GET /api/dashboard/filter-options
// ---------------------------------------------------------------------------
export async function getFilterOptions(clientId: string) {
  const client = await getClientById(clientId);
  if (!client) throw new NotFoundError('Client not found');
  const { courses, sources } = await getFilterOptionsRepo(clientId);
  return { courses, sources };
}

// ---------------------------------------------------------------------------
// GET /api/dashboard/overview
// ---------------------------------------------------------------------------
export async function getOverview(req: ResolvedRequest) {
  const previousRange = previousEqualPeriod(req.range);

  const [leads, spendRows, feeMap, previousLeads] = await Promise.all([
    getLeadsCreatedInRange(req.clientId, req.range.from, req.range.to, req.filters),
    getSpendInRange(req.clientId, req.range.from, req.range.to, spendFilterFor(req)),
    feeMapFor(req.clientId),
    getLeadsCreatedInRange(req.clientId, previousRange.from, previousRange.to, req.filters),
  ]);

  const { spend, impressions, clicks } = sumSpend(spendRows);
  const qualifiedCount = leads.filter((l) => l.status === 'qualified').length;
  const enrolledCount = calc.countEnrolled(leads);
  const revenue = sumEnrolledRevenue(leads, feeMap);

  const pacing = currentMonthPacing(req.timezone);
  const monthLeads = await getLeadsCreatedInRange(req.clientId, pacing.monthStart, pacing.today, req.filters);
  const targets = await getTargetsForMonth(req.clientId, pacing.monthStart);
  const scopedTargets = req.filters.courseId ? targets.filter((t) => t.course_id === req.filters.courseId) : targets;
  const totalTarget = scopedTargets.reduce((sum, t) => sum + t.lead_target, 0);

  // Same monthLeads dataset as targetPacing above, just broken out per metric so every target
  // type set in the targets table (not just lead_target) gets a real actual-vs-target comparison
  // - qualified_target/enrollment_target/revenue_target existed in the schema but nothing read
  // them until now.
  const targetTotals = scopedTargets.reduce(
    (acc, t) => ({
      leads: acc.leads + t.lead_target,
      qualified: acc.qualified + t.qualified_target,
      enrolled: acc.enrolled + t.enrollment_target,
      revenue: acc.revenue + t.revenue_target,
    }),
    { leads: 0, qualified: 0, enrolled: 0, revenue: 0 },
  );
  const monthlyTargets =
    targetTotals.leads + targetTotals.qualified + targetTotals.enrolled + targetTotals.revenue > 0
      ? {
          leads: { target: targetTotals.leads, actual: monthLeads.length },
          qualified: { target: targetTotals.qualified, actual: monthLeads.filter((l) => l.status === 'qualified').length },
          enrolled: { target: targetTotals.enrolled, actual: calc.countEnrolled(monthLeads) },
          revenue: { target: targetTotals.revenue, actual: sumEnrolledRevenue(monthLeads, feeMap) },
        }
      : null;

  // Targets by course (their feedback #6: "Segregate targets by course"). monthLeads is already
  // unscoped when no course filter is active - only issue the extra query when a course filter
  // is currently narrowing monthLeads, so per-course actuals aren't limited to that one course.
  const allCourseMonthLeads = req.filters.courseId
    ? await getLeadsCreatedInRange(req.clientId, pacing.monthStart, pacing.today, { ...req.filters, courseId: undefined })
    : monthLeads;
  const courses = await getCourseFees(req.clientId);
  const courseNameMap = new Map(courses.map((c) => [c.id, c.name]));
  const leadsByCourse = new Map<string, LeadRow[]>();
  for (const lead of allCourseMonthLeads) {
    if (!lead.course_id) continue;
    if (!leadsByCourse.has(lead.course_id)) leadsByCourse.set(lead.course_id, []);
    leadsByCourse.get(lead.course_id)!.push(lead);
  }
  const targetsByCourse = targets.map((t) => {
    const courseLeads = leadsByCourse.get(t.course_id) ?? [];
    return {
      courseId: t.course_id,
      courseName: courseNameMap.get(t.course_id) ?? 'Unknown',
      leads: { target: t.lead_target, actual: courseLeads.length },
      qualified: { target: t.qualified_target, actual: courseLeads.filter((l) => l.status === 'qualified').length },
      enrolled: { target: t.enrollment_target, actual: calc.countEnrolled(courseLeads) },
      revenue: { target: t.revenue_target, actual: sumEnrolledRevenue(courseLeads, feeMap) },
    };
  });

  return {
    range: req.range,
    leads: calc.countLeads(leads),
    qualified: qualifiedCount,
    qualifiedRate: calc.qualifiedRate(leads),
    junkRate: calc.junkRate(leads),
    enrolled: enrolledCount,
    impressions,
    clicks,
    spend,
    revenue,
    cpl: calc.costPerLead(spend, leads.length),
    costPerQualified: calc.costPerQualified(spend, qualifiedCount),
    costPerEnrollment: calc.costPerEnrollment(spend, enrolledCount),
    roas: calc.returnOnAdSpend(revenue, spend),
    periodOverPeriod: calc.periodOverPeriodDelta(leads.length, previousLeads.length),
    speedToLeadMedianHours: calc.speedToLead(leads).medianHours,
    targetPacing:
      totalTarget > 0
        ? calc.targetPacing({
            target: totalTarget,
            actualMtdLeads: monthLeads.length,
            dayOfMonth: pacing.dayOfMonth,
            daysInMonth: pacing.daysInMonth,
            daysRemaining: pacing.daysRemaining,
          })
        : null,
    monthlyTargets,
    targetsByCourse,
  };
}

// ---------------------------------------------------------------------------
// GET/PUT /api/dashboard/targets
// ---------------------------------------------------------------------------
export async function getTargets(clientId: string, month: string) {
  const targets = await getTargetsForMonth(clientId, month);
  return targets.map((t) => ({
    courseId: t.course_id,
    month: t.month,
    leadTarget: t.lead_target,
    qualifiedTarget: t.qualified_target,
    enrollmentTarget: t.enrollment_target,
    revenueTarget: t.revenue_target,
  }));
}

export async function saveTargets(clientId: string, month: string, targets: TargetInput[]): Promise<void> {
  await upsertTargetsForMonth(clientId, month, targets);
}

// ---------------------------------------------------------------------------
// GET /api/dashboard/leads/enrolled, PATCH /api/dashboard/leads/:leadId/revenue
// ---------------------------------------------------------------------------
export async function listEnrolledLeads(clientId: string) {
  return getEnrolledLeads(clientId);
}

export async function setLeadRevenue(clientId: string, leadId: string, feePaid: number): Promise<void> {
  await updateLeadFeePaid(clientId, leadId, feePaid);
}

export async function setLeadCourse(clientId: string, leadId: string, courseId: string): Promise<void> {
  await updateLeadCourse(clientId, leadId, courseId);
}

// ---------------------------------------------------------------------------
// GET /api/dashboard/leads/:leadId/timeline
// ---------------------------------------------------------------------------
export async function getLeadTimeline(clientId: string, leadId: string) {
  const [lead, activities] = await Promise.all([getLeadDetail(clientId, leadId), getLeadActivities(clientId, leadId)]);
  return { lead, activities };
}

// ---------------------------------------------------------------------------
// GET /api/dashboard/trends
// ---------------------------------------------------------------------------
export async function getTrends(req: ResolvedRequest) {
  const [leads, spendRows] = await Promise.all([
    getLeadsCreatedInRange(req.clientId, req.range.from, req.range.to, req.filters),
    getSpendInRange(req.clientId, req.range.from, req.range.to, spendFilterFor(req)),
  ]);

  const leadsByDay = new Map<string, LeadRow[]>();
  for (const lead of leads) {
    const day = dayKey(lead.created_at, req.timezone);
    if (!leadsByDay.has(day)) leadsByDay.set(day, []);
    leadsByDay.get(day)!.push(lead);
  }

  const spendByDay = new Map<string, { spend: number; impressions: number; clicks: number }>();
  for (const row of spendRows) {
    const entry = spendByDay.get(row.date) ?? { spend: 0, impressions: 0, clicks: 0 };
    entry.spend += Number(row.spend);
    entry.impressions += Number(row.impressions);
    entry.clicks += Number(row.clicks);
    spendByDay.set(row.date, entry);
  }

  const days: string[] = [];
  const cursor = new Date(`${req.range.from}T00:00:00.000Z`);
  const end = new Date(`${req.range.to}T00:00:00.000Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return {
    range: req.range,
    series: days.map((day) => {
      const dayLeads = leadsByDay.get(day) ?? [];
      const daySpend = spendByDay.get(day) ?? { spend: 0, impressions: 0, clicks: 0 };
      const qualified = dayLeads.filter((l) => l.status === 'qualified').length;
      return {
        date: day,
        leads: dayLeads.length,
        qualified,
        enrolled: calc.countEnrolled(dayLeads),
        spend: daySpend.spend,
        impressions: daySpend.impressions,
        clicks: daySpend.clicks,
        cpl: calc.costPerLead(daySpend.spend, dayLeads.length),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// GET /api/dashboard/funnel
// ---------------------------------------------------------------------------
export async function getFunnel(req: ResolvedRequest) {
  const leads = await getLeadsCreatedInRange(req.clientId, req.range.from, req.range.to, req.filters);
  return { range: req.range, stages: calc.funnel(leads) };
}

// ---------------------------------------------------------------------------
// GET /api/dashboard/sales
// ---------------------------------------------------------------------------
export async function getSales(req: ResolvedRequest) {
  const [rangedLeads, uncalled, cohortLeads] = await Promise.all([
    getLeadsCreatedInRange(req.clientId, req.range.from, req.range.to, req.filters),
    getUncalledLeads(req.clientId, req.filters),
    getLeadsForCohort(req.clientId, req.filters),
  ]);

  return {
    range: req.range,
    speedToLead: calc.speedToLead(rangedLeads),
    uncalledAging: calc.uncalledAging(uncalled),
    followUpDepth: calc.followUpDepth(rangedLeads),
    cohortConversion: calc.cohortConversion(cohortLeads, req.timezone),
    arrivalHeatmap: calc.arrivalHeatmap(rangedLeads, req.timezone),
    leadQuality: calc.leadQualityBreakdown(rangedLeads),
    disqualificationReasons: calc.disqualificationReasons(rangedLeads),
    salesTeam: calc.salesTeamBreakdown(rangedLeads, uncalled),
  };
}

// ---------------------------------------------------------------------------
// GET /api/dashboard/source-performance
// ---------------------------------------------------------------------------
export async function getSourcePerformance(req: ResolvedRequest) {
  const rows = await getSourcePerformanceRepo(req.clientId, req.range.from, req.range.to, req.filters.courseId);

  return {
    range: req.range,
    sources: rows.map((r) => {
      const spend = Number(r.spend);
      const leads = Number(r.leads);
      const qualified = Number(r.qualified);
      const enrolled = Number(r.enrolled);
      const revenue = Number(r.revenue);
      return {
        source: r.source,
        leads,
        qualified,
        qualifiedRate: calc.rate(qualified, leads),
        enrolled,
        impressions: Number(r.impressions),
        clicks: Number(r.clicks),
        spend,
        revenue,
        cpl: calc.costPerLead(spend, leads),
        costPerQualified: calc.costPerQualified(spend, qualified),
        costPerEnrollment: calc.costPerEnrollment(spend, enrolled),
        roas: calc.returnOnAdSpend(revenue, spend),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// GET /api/dashboard/campaign-performance
// ---------------------------------------------------------------------------
export async function getCampaignPerformance(req: ResolvedRequest) {
  const rows = await getCampaignPerformanceRepo(req.clientId, req.range.from, req.range.to, {
    platform: spendFilterFor(req).platform,
    courseId: req.filters.courseId,
    campaignId: req.filters.campaignFilter?.id,
  });

  // fn_campaign_performance_range has no not_reachable ("No Response") breakdown - derived
  // directly from leads instead (see getNotReachableCountByCampaign's doc comment). Rows can mix
  // meta and google campaigns, so split by platform first - the lookup needs one platform at a time.
  const metaIds = rows.filter((r) => r.platform === 'meta').map((r) => r.campaign_id);
  const googleIds = rows.filter((r) => r.platform === 'google').map((r) => r.campaign_id);
  const [metaNotReachable, googleNotReachable] = await Promise.all([
    getNotReachableCountByCampaign(req.clientId, 'meta', metaIds, req.range.from, req.range.to),
    getNotReachableCountByCampaign(req.clientId, 'google', googleIds, req.range.from, req.range.to),
  ]);
  const notReachableByCampaignId = new Map([...metaNotReachable, ...googleNotReachable]);

  // Campaign rows only cover leads whose Meritto free-text "campaign" field matched a real
  // campaign name (see attributionLookupRepo.ts's exact-match resolver) - some leads legitimately
  // have no campaign-level match (blank/mismatched text from the source CRM) and are deliberately
  // left out of every campaign row rather than guessed into one. The KPI strip above the table is
  // meant to show the client's true totals for the current filters though, so it's computed
  // straight from all matching leads (same shape as Overview/getSourcePerformance), not summed
  // from the (necessarily incomplete) campaign rows. Spend/impressions/clicks aren't affected by
  // this gap - those come from the ad platforms directly, independent of lead attribution.
  const [feeMap, trueLeads] = await Promise.all([feeMapFor(req.clientId), getLeadsCreatedInRange(req.clientId, req.range.from, req.range.to, req.filters)]);
  const rowSpendTotals = rows.reduce(
    (acc, r) => ({ spend: acc.spend + Number(r.spend), impressions: acc.impressions + Number(r.impressions), clicks: acc.clicks + Number(r.clicks) }),
    { spend: 0, impressions: 0, clicks: 0 },
  );
  const totals = {
    ...rowSpendTotals,
    leads: trueLeads.length,
    qualified: trueLeads.filter((l) => l.status === 'qualified').length,
    enrolled: calc.countEnrolled(trueLeads),
    revenue: sumEnrolledRevenue(trueLeads, feeMap),
  };

  return {
    range: req.range,
    totals,
    campaigns: rows.map((r) => ({
      provider: r.platform,
      campaignId: r.campaign_id,
      campaignName: r.campaign_name,
      status: r.status,
      courseCode: r.course_code,
      impressions: Number(r.impressions),
      clicks: Number(r.clicks),
      ctr: calc.rate(Number(r.clicks), Number(r.impressions)),
      spend: Number(r.spend),
      leads: Number(r.leads),
      qualified: Number(r.qualified),
      qualifiedRate: calc.rate(Number(r.qualified), Number(r.leads)),
      notReachable: notReachableByCampaignId.get(r.campaign_id) ?? 0,
      enrolled: Number(r.enrolled),
      revenue: Number(r.revenue),
      cpl: calc.costPerLead(Number(r.spend), Number(r.leads)),
      costPerQualified: calc.costPerQualified(Number(r.spend), Number(r.qualified)),
      costPerEnrollment: calc.costPerEnrollment(Number(r.spend), Number(r.enrolled)),
      roas: calc.returnOnAdSpend(Number(r.revenue), Number(r.spend)),
    })),
  };
}

// ---------------------------------------------------------------------------
// GET /api/dashboard/creative-performance
// ---------------------------------------------------------------------------
export async function getCreativePerformance(req: ResolvedRequest) {
  const rows = await getCreativePerformanceRepo(req.clientId, req.range.from, req.range.to, {
    platform: spendFilterFor(req).platform,
    courseId: req.filters.courseId,
  });

  const fatigueMap = await getCreativeFatigueMap(
    req.clientId,
    rows.map((r) => r.creative_id),
  );

  // fn_creative_performance_range has no not_reachable ("No Response") breakdown - derived
  // directly from leads instead (see getNotReachableCountByCreative's doc comment).
  const notReachableByCreativeId = await getNotReachableCountByCreative(
    req.clientId,
    rows.map((r) => r.creative_id),
    req.range.from,
    req.range.to,
  );

  // Same gap as getCampaignPerformance's `totals` (see its comment): creative rows only cover
  // leads that matched a real creative, so the hero KPI strip is computed from all matching leads
  // instead of summed from `creatives`, to avoid silently dropping unattributed leads again.
  const [feeMap, trueLeads] = await Promise.all([feeMapFor(req.clientId), getLeadsCreatedInRange(req.clientId, req.range.from, req.range.to, req.filters)]);
  const rowSpendTotals = rows.reduce(
    (acc, r) => ({ spend: acc.spend + Number(r.spend), impressions: acc.impressions + Number(r.impressions), clicks: acc.clicks + Number(r.clicks) }),
    { spend: 0, impressions: 0, clicks: 0 },
  );
  const totals = {
    ...rowSpendTotals,
    leads: trueLeads.length,
    qualified: trueLeads.filter((l) => l.status === 'qualified').length,
    enrolled: calc.countEnrolled(trueLeads),
    revenue: sumEnrolledRevenue(trueLeads, feeMap),
  };

  return {
    range: req.range,
    totals,
    creatives: rows.map((r) => {
      const impressions = Number(r.impressions);
      const clicks = Number(r.clicks);
      const spend = Number(r.spend);
      const leads = Number(r.leads);
      const qualified = Number(r.qualified);
      const junk = Number(r.junk);
      const enrolled = Number(r.enrolled);
      const revenue = Number(r.revenue);

      return {
        provider: r.platform,
        creativeId: r.creative_id,
        creativeName: r.creative_name,
        creativePreviewUrl: pickGridPreviewUrl(r.asset_url, r.thumbnail_url),
        status: r.status,
        courseCode: r.course_code,
        campaignName: r.campaign_name,
        adGroupName: r.adset_or_adgroup,
        spend,
        impressions,
        clicks,
        ctr: calc.rate(clicks, impressions),
        leads,
        cpl: calc.costPerLead(spend, leads),
        qualified,
        qualifiedRate: calc.rate(qualified, leads),
        junk,
        junkRate: calc.rate(junk, leads),
        notReachable: notReachableByCreativeId.get(r.creative_id) ?? 0,
        enrolled,
        costPerQualified: calc.costPerQualified(spend, qualified),
        costPerEnrollment: calc.costPerEnrollment(spend, enrolled),
        revenue,
        roas: calc.returnOnAdSpend(revenue, spend),
        fatigue: fatigueMap.get(r.creative_id) ?? null,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// GET /api/dashboard/revenue
// ---------------------------------------------------------------------------
export async function getRevenue(req: ResolvedRequest) {
  const [leads, spendRows, courses] = await Promise.all([
    getLeadsCreatedInRange(req.clientId, req.range.from, req.range.to, req.filters),
    getSpendInRange(req.clientId, req.range.from, req.range.to, spendFilterFor(req)),
    getCourseFees(req.clientId),
  ]);

  const feeMap = new Map(courses.map((c) => [c.id, c.fee]));
  const courseInfoMap = new Map(courses.map((c) => [c.id, { code: c.code, name: c.name }]));
  const { spend } = sumSpend(spendRows);
  const courseIds = [...new Set(leads.map((l) => l.course_id).filter((c): c is string => Boolean(c)))];

  const byCourse = courseIds.map((courseId) => {
    const courseLeads = leads.filter((l) => l.course_id === courseId);
    const revenue = sumEnrolledRevenue(courseLeads, feeMap);
    const enrolled = calc.countEnrolled(courseLeads);
    const info = courseInfoMap.get(courseId);
    return {
      courseId,
      courseCode: info?.code ?? null,
      courseName: info?.name ?? null,
      enrolled,
      revenue,
      costPerEnrollment: calc.costPerEnrollment(spend, enrolled),
    };
  });

  const totalRevenue = sumEnrolledRevenue(leads, feeMap);

  return {
    range: req.range,
    totalRevenue,
    totalSpend: spend,
    blendedRoas: calc.returnOnAdSpend(totalRevenue, spend),
    byCourse,
  };
}

// ---------------------------------------------------------------------------
// GET /api/dashboard/campaigns/:campaignId - drilldown panel
// ---------------------------------------------------------------------------
export async function getCampaignDetail(req: ResolvedRequest, campaignId: string) {
  // The campaign's own platform isn't known up front - fn_campaign_performance_range's
  // p_campaign_id filter works regardless of platform, so pull the summary row
  // first to learn it, then use it to scope the rest of the drilldown queries.
  // Course/platform filters passed through too (previously dropped here) - without them, the
  // Campaigns table row (course-filtered) and this same campaign's drawer (always unfiltered)
  // showed different spend/leads/revenue whenever a Course filter was active.
  const summaryRows = await getCampaignPerformanceRepo(req.clientId, req.range.from, req.range.to, {
    campaignId,
    platform: spendFilterFor(req).platform,
    courseId: req.filters.courseId,
  });
  const summary = summaryRows[0];
  if (!summary) throw new NotFoundError('Campaign not found for this client/date range');

  const platform = summary.platform as 'meta' | 'google';

  const [trend, adGroups, ads, creativesRaw] = await Promise.all([
    getCampaignDailyTrend(req.clientId, platform, campaignId, req.range.from, req.range.to),
    getCampaignAdGroups(req.clientId, platform, campaignId, req.range.from, req.range.to),
    getCampaignAds(req.clientId, platform, campaignId, req.range.from, req.range.to),
    getCampaignCreatives(req.clientId, platform, campaignId, req.range.from, req.range.to),
  ]);

  const fatigueMap = await getCreativeFatigueMap(
    req.clientId,
    creativesRaw.map((c) => c.creative_id),
  );

  // fn_campaign_ads has no enrolled count - derived directly from leads instead (see
  // getEnrolledCountByAdId's doc comment). Computed once for every ad here rather than per
  // top/worst slice, since both are just different slices of the same `ads` set.
  const enrolledByAdId = await getEnrolledCountByAdId(
    req.clientId,
    platform,
    ads.map((a) => a.ad_id),
    req.range.from,
    req.range.to,
  );

  // "No Response" (not_reachable) count for the campaign summary - same application-layer
  // derivation as enrolledByAdId above, see getNotReachableCountByCampaign's doc comment.
  const notReachableByCampaignId = await getNotReachableCountByCampaign(req.clientId, platform, [campaignId], req.range.from, req.range.to);

  const adsRanked = [...ads].sort((a, b) => Number(b.leads) - Number(a.leads));

  return {
    range: req.range,
    campaign: {
      provider: summary.platform,
      campaignId: summary.campaign_id,
      campaignName: summary.campaign_name,
      status: summary.status,
      courseCode: summary.course_code,
      spend: Number(summary.spend),
      impressions: Number(summary.impressions),
      clicks: Number(summary.clicks),
      ctr: calc.rate(Number(summary.clicks), Number(summary.impressions)),
      leads: Number(summary.leads),
      qualified: Number(summary.qualified),
      qualifiedRate: calc.rate(Number(summary.qualified), Number(summary.leads)),
      notReachable: notReachableByCampaignId.get(campaignId) ?? 0,
      enrolled: Number(summary.enrolled),
      revenue: Number(summary.revenue),
      cpl: calc.costPerLead(Number(summary.spend), Number(summary.leads)),
      costPerQualified: calc.costPerQualified(Number(summary.spend), Number(summary.qualified)),
      costPerEnrollment: calc.costPerEnrollment(Number(summary.spend), Number(summary.enrolled)),
      roas: calc.returnOnAdSpend(Number(summary.revenue), Number(summary.spend)),
    },
    trend: trend.map((t) => ({
      date: t.date,
      spend: Number(t.spend),
      impressions: Number(t.impressions),
      clicks: Number(t.clicks),
      leads: Number(t.leads),
      qualified: Number(t.qualified),
      enrolled: Number(t.enrolled),
    })),
    adGroups: adGroups.map((a) => ({
      adsetId: a.adset_id,
      adsetName: a.adset_name,
      spend: Number(a.spend),
      impressions: Number(a.impressions),
      clicks: Number(a.clicks),
      leads: Number(a.leads),
      qualified: Number(a.qualified),
      qualifiedRate: calc.rate(Number(a.qualified), Number(a.leads)),
    })),
    topAds: adsRanked.slice(0, 5).map((a) => ({
      adId: a.ad_id,
      adName: a.ad_name,
      spend: Number(a.spend),
      leads: Number(a.leads),
      qualified: Number(a.qualified),
      qualifiedRate: calc.rate(Number(a.qualified), Number(a.leads)),
      enrolled: enrolledByAdId.get(a.ad_id) ?? 0,
    })),
    worstAds: [...adsRanked]
      .reverse()
      .slice(0, 5)
      .map((a) => ({
        adId: a.ad_id,
        adName: a.ad_name,
        spend: Number(a.spend),
        leads: Number(a.leads),
        qualified: Number(a.qualified),
        qualifiedRate: calc.rate(Number(a.qualified), Number(a.leads)),
        enrolled: enrolledByAdId.get(a.ad_id) ?? 0,
      })),
    creatives: creativesRaw.map((c) => ({
      creativeId: c.creative_id,
      creativeName: c.creative_name,
      creativePreviewUrl: pickGridPreviewUrl(c.asset_url, c.thumbnail_url),
      spend: Number(c.spend),
      leads: Number(c.leads),
      qualified: Number(c.qualified),
      qualifiedRate: calc.rate(Number(c.qualified), Number(c.leads)),
      fatigue: fatigueMap.get(c.creative_id) ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------
// GET /api/dashboard/creatives/:creativeId - drilldown drawer
// ---------------------------------------------------------------------------
export async function getCreativeDetail(req: ResolvedRequest, creativeId: string) {
  const info = await getCreativeLibraryInfo(req.clientId, creativeId);
  if (!info) throw new NotFoundError('Creative not found for this client');

  // Course/platform filters passed through too (previously an empty {} here, always unfiltered) -
  // same mismatch as getCampaignDetail: the Creatives grid (course-filtered) and this same
  // creative's drawer showed different spend/leads/revenue whenever a Course filter was active.
  const [performanceRows, trend, fatigue] = await Promise.all([
    getCreativePerformanceRepo(req.clientId, req.range.from, req.range.to, {
      platform: spendFilterFor(req).platform,
      courseId: req.filters.courseId,
    }),
    getCreativeDailyTrend(req.clientId, creativeId, req.range.from, req.range.to),
    getCreativeFatigueDetail(req.clientId, creativeId, req.range.to),
  ]);

  const performance = performanceRows.find((r) => r.creative_id === creativeId);
  const spend = Number(performance?.spend ?? 0);
  const impressions = Number(performance?.impressions ?? 0);
  const clicks = Number(performance?.clicks ?? 0);
  const leads = Number(performance?.leads ?? 0);
  const qualified = Number(performance?.qualified ?? 0);
  const junk = Number(performance?.junk ?? 0);
  const enrolled = Number(performance?.enrolled ?? 0);
  const revenue = Number(performance?.revenue ?? 0);

  // fn_creative_performance_range has no not_reachable ("No Response") breakdown - derived
  // directly from leads instead (see getNotReachableCountByCreative's doc comment).
  const notReachableByCreativeId = await getNotReachableCountByCreative(req.clientId, [creativeId], req.range.from, req.range.to);
  const notReachable = notReachableByCreativeId.get(creativeId) ?? 0;

  return {
    range: req.range,
    creative: {
      ...info,
      platform: performance?.platform ?? info.mappings[0]?.platform ?? null,
      campaignName: performance?.campaign_name ?? info.mappings[0]?.campaignName ?? null,
      adGroupName: performance?.adset_or_adgroup ?? info.mappings[0]?.adsetOrAdgroupName ?? null,
      courseCode: performance?.course_code ?? null,
    },
    performance: {
      spend,
      impressions,
      clicks,
      ctr: calc.rate(clicks, impressions),
      leads,
      cpl: calc.costPerLead(spend, leads),
      qualified,
      qualifiedRate: calc.rate(qualified, leads),
      junk,
      junkRate: calc.rate(junk, leads),
      notReachable,
      enrolled,
      costPerQualified: calc.costPerQualified(spend, qualified),
      costPerEnrollment: calc.costPerEnrollment(spend, enrolled),
      revenue,
      roas: calc.returnOnAdSpend(revenue, spend),
    },
    trend: trend.map((t) => ({
      date: t.date,
      spend: Number(t.spend),
      impressions: Number(t.impressions),
      clicks: Number(t.clicks),
      leads: Number(t.leads),
      qualified: Number(t.qualified),
      junk: Number(t.junk),
      enrolled: Number(t.enrolled),
    })),
    fatigue,
  };
}
