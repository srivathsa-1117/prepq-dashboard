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
  type TargetInput,
  getCourseFees,
  getCampaignDailyTrend,
  getCampaignAdGroups,
  getCampaignAds,
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
import { resolveDateRange, previousEqualPeriod, currentMonthPacing, type DateRange } from '../utils/dateRanges.js';
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

  return {
    range: req.range,
    leads: calc.countLeads(leads),
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
// GET /api/dashboard/trends
// ---------------------------------------------------------------------------
export async function getTrends(req: ResolvedRequest) {
  const [leads, spendRows] = await Promise.all([
    getLeadsCreatedInRange(req.clientId, req.range.from, req.range.to, req.filters),
    getSpendInRange(req.clientId, req.range.from, req.range.to, spendFilterFor(req)),
  ]);

  const leadsByDay = new Map<string, LeadRow[]>();
  for (const lead of leads) {
    const day = lead.created_at.slice(0, 10);
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

  return {
    range: req.range,
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

  return {
    range: req.range,
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
  const summaryRows = await getCampaignPerformanceRepo(req.clientId, req.range.from, req.range.to, { campaignId });
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
      qualifiedRate: calc.rate(Number(a.qualified), Number(a.leads)),
    })),
    worstAds: [...adsRanked]
      .reverse()
      .slice(0, 5)
      .map((a) => ({
        adId: a.ad_id,
        adName: a.ad_name,
        spend: Number(a.spend),
        leads: Number(a.leads),
        qualifiedRate: calc.rate(Number(a.qualified), Number(a.leads)),
      })),
    creatives: creativesRaw.map((c) => ({
      creativeId: c.creative_id,
      creativeName: c.creative_name,
      creativePreviewUrl: pickGridPreviewUrl(c.asset_url, c.thumbnail_url),
      spend: Number(c.spend),
      leads: Number(c.leads),
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

  const [performanceRows, trend, fatigue] = await Promise.all([
    getCreativePerformanceRepo(req.clientId, req.range.from, req.range.to, {}),
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
