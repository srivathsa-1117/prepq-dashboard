import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LeadRow } from '../../../src/repositories/reportingRepo.js';

/**
 * Regression guard for a real bug: the Campaigns/Creatives KPI strips used to be computed by
 * summing the already-fetched per-campaign/per-creative rows client-side. Those rows only cover
 * leads whose Meritto free-text attribution matched a real campaign/creative name (by design -
 * see attributionLookupRepo.ts's exact-match resolver) - leads that didn't match (e.g. a real
 * Google Ads lead whose Meritto "campaign" field was blank or didn't match any live campaign name)
 * are deliberately left out of every row rather than guessed into one. Live case that caught this:
 * 4 real Google leads this month, correctly counted in Source Performance, showed as 0
 * Leads/Qualified/Enrolled across every Google campaign AND in the page's own KPI summary, despite
 * genuine non-zero Spend.
 *
 * getCampaignPerformance/getCreativePerformance now return a `totals` field computed from the full
 * matching lead set (getLeadsCreatedInRange), independent of per-row attribution. This test fails
 * if that totals computation ever regresses back to summing the (necessarily incomplete) rows.
 */

const mocks = vi.hoisted(() => ({
  getClientById: vi.fn(),
  getCampaignPerformanceRepo: vi.fn(),
  getCreativePerformanceRepo: vi.fn(),
  getNotReachableCountByCampaign: vi.fn(),
  getNotReachableCountByCreative: vi.fn(),
  getLeadsCreatedInRange: vi.fn(),
  getCourseFees: vi.fn(),
  resolveCourseId: vi.fn(),
  resolveCampaignFilter: vi.fn(),
  resolveCreativeId: vi.fn(),
  getCreativeFatigueMap: vi.fn(),
}));

vi.mock('../../../src/repositories/clientsRepo.js', () => ({
  getClientById: mocks.getClientById,
}));

vi.mock('../../../src/repositories/reportingRepo.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/repositories/reportingRepo.js')>();
  return {
    ...actual,
    getCampaignPerformance: mocks.getCampaignPerformanceRepo,
    getCreativePerformance: mocks.getCreativePerformanceRepo,
    getNotReachableCountByCampaign: mocks.getNotReachableCountByCampaign,
    getNotReachableCountByCreative: mocks.getNotReachableCountByCreative,
    getLeadsCreatedInRange: mocks.getLeadsCreatedInRange,
    getCourseFees: mocks.getCourseFees,
    resolveCourseId: mocks.resolveCourseId,
    resolveCampaignFilter: mocks.resolveCampaignFilter,
    resolveCreativeId: mocks.resolveCreativeId,
  };
});

vi.mock('../../../src/services/fatigueService.js', () => ({
  getCreativeFatigueMap: mocks.getCreativeFatigueMap,
  getCreativeFatigueDetail: vi.fn(),
}));

const { resolveRequest, getCampaignPerformance, getCreativePerformance } = await import('../../../src/services/reportingService.js');

function makeLead(overrides: Partial<LeadRow> = {}): LeadRow {
  return {
    id: crypto.randomUUID(),
    created_at: '2026-11-05T00:00:00.000Z',
    course_id: null,
    source: 'google',
    dqReason: null,
    owner: null,
    status: 'qualified',
    call_attempts: 1,
    first_call_at: null,
    connect_attempt: null,
    connected: false,
    demo_booked_at: null,
    demo_attended_at: null,
    enrolled_at: null,
    fee_paid: null,
    ...overrides,
  };
}

const CLIENT_ID = 'client-1';

describe('getCampaignPerformance totals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClientById.mockResolvedValue({ id: CLIENT_ID, timezone: 'UTC' });
    mocks.getCourseFees.mockResolvedValue([]);
    mocks.getNotReachableCountByCampaign.mockResolvedValue(new Map());
  });

  it('counts leads with no campaign-level match in `totals`, not just leads summed from `campaigns`', async () => {
    // Real spend, but the SQL function's leads/qualified/enrolled are 0 for this campaign - no
    // lead's Meritto attribution matched it.
    mocks.getCampaignPerformanceRepo.mockResolvedValue([
      {
        platform: 'google',
        campaign_id: 'camp-1',
        campaign_name: 'EA | Lead | 11 Feb | DN',
        status: 'ENABLED',
        course_code: null,
        spend: 5645,
        impressions: 451,
        clicks: 40,
        leads: 0,
        qualified: 0,
        enrolled: 0,
        revenue: 0,
      },
    ]);
    // But 2 real Google leads exist for this period - just unmatched to any campaign.
    mocks.getLeadsCreatedInRange.mockResolvedValue([makeLead({ status: 'qualified' }), makeLead({ status: 'not_qualified' })]);

    const req = await resolveRequest({ clientId: CLIENT_ID, range: '30d', source: 'google' });
    const result = await getCampaignPerformance(req);

    expect(result.campaigns).toHaveLength(1);
    expect(result.campaigns[0]!.leads).toBe(0); // per-campaign row stays 0 - never guessed into a campaign

    // The actual regression: this must come from the true lead set, not sum(campaigns.leads) (= 0).
    expect(result.totals.leads).toBe(2);
    expect(result.totals.qualified).toBe(1);
    expect(result.totals.spend).toBe(5645); // spend is unaffected either way - it comes from the ad platform, not leads
  });
});

describe('getCreativePerformance totals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClientById.mockResolvedValue({ id: CLIENT_ID, timezone: 'UTC' });
    mocks.getCourseFees.mockResolvedValue([]);
    mocks.getNotReachableCountByCreative.mockResolvedValue(new Map());
    mocks.getCreativeFatigueMap.mockResolvedValue(new Map());
  });

  it('counts leads with no creative-level match in `totals`, not just leads summed from `creatives`', async () => {
    mocks.getCreativePerformanceRepo.mockResolvedValue([
      {
        creative_id: 'creative-1',
        creative_name: 'Search Ad 1',
        thumbnail_url: null,
        asset_url: null,
        status: 'ENABLED',
        platform: 'google',
        campaign_name: 'EA | Lead | 11 Feb | DN',
        adset_or_adgroup: null,
        course_code: null,
        spend: 5645,
        impressions: 451,
        clicks: 40,
        leads: 0,
        qualified: 0,
        junk: 0,
        enrolled: 0,
        revenue: 0,
      },
    ]);
    mocks.getLeadsCreatedInRange.mockResolvedValue([makeLead({ status: 'qualified' }), makeLead({ status: 'not_qualified' })]);

    const req = await resolveRequest({ clientId: CLIENT_ID, range: '30d', source: 'google' });
    const result = await getCreativePerformance(req);

    expect(result.creatives).toHaveLength(1);
    expect(result.creatives[0]!.leads).toBe(0);

    expect(result.totals.leads).toBe(2);
    expect(result.totals.qualified).toBe(1);
    expect(result.totals.spend).toBe(5645);
  });
});
