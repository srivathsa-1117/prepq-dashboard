import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression guard for a real production bug: getNotReachableCountByCreative used to filter with
 * `.in('creative_id', creativeIds)`. With this account's 534 creatives, that put a
 * ~20,000-character IN-list in the request URL, which PostgREST's GET request couldn't carry -
 * every request failed with a generic "fetch failed" (no HTTP status, since the request itself
 * never went through), and the entire Creatives page broke with "Unable to load data". Fixed by
 * dropping the `.in()` filter entirely (scan by date+status, let callers do `.get(id) ?? 0`) in
 * getEnrolledCountByAdId, getNotReachableCountByCampaign, and getNotReachableCountByCreative alike
 * - see their doc comments in reportingRepo.ts. This test fails if any of them goes back to
 * filtering by an id list, regardless of how many ids are passed in.
 */

const mocks = vi.hoisted(() => {
  const calledMethods: string[] = [];
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ['select', 'eq', 'gte', 'lte']) {
    builder[method] = () => builder;
  }
  builder.in = () => {
    calledMethods.push('in');
    return builder;
  };
  builder.not = () => {
    calledMethods.push('not');
    return builder;
  };
  builder.range = () => Promise.resolve({ data: [], error: null });
  return { calledMethods, builder, from: () => builder };
});

vi.mock('../../../src/database/supabaseClient.js', () => ({
  supabaseAdmin: { from: mocks.from },
}));

const { getEnrolledCountByAdId, getNotReachableCountByCampaign, getNotReachableCountByCreative } = await import('../../../src/repositories/reportingRepo.js');

// A count well past what caused the live URL-length failure (534 creatives) - the whole point is
// that correctness here must not depend on this number.
const MANY_IDS = Array.from({ length: 2000 }, (_, i) => `id-${i}`);

describe('leads-derived count queries never filter by an unbounded id list', () => {
  beforeEach(() => {
    mocks.calledMethods.length = 0;
  });

  it('getEnrolledCountByAdId uses .not(...).is(null) instead of .in(column, adIds)', async () => {
    await getEnrolledCountByAdId('client-1', 'meta', MANY_IDS, '2026-01-01', '2026-01-31');
    expect(mocks.calledMethods).not.toContain('in');
    expect(mocks.calledMethods).toContain('not');
  });

  it('getNotReachableCountByCampaign uses .not(...).is(null) instead of .in(column, campaignIds)', async () => {
    await getNotReachableCountByCampaign('client-1', 'google', MANY_IDS, '2026-01-01', '2026-01-31');
    expect(mocks.calledMethods).not.toContain('in');
    expect(mocks.calledMethods).toContain('not');
  });

  it('getNotReachableCountByCreative uses .not(...).is(null) instead of .in(\'creative_id\', creativeIds) - the exact query that broke the Creatives page live', async () => {
    await getNotReachableCountByCreative('client-1', MANY_IDS, '2026-01-01', '2026-01-31');
    expect(mocks.calledMethods).not.toContain('in');
    expect(mocks.calledMethods).toContain('not');
  });
});
