import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Fake Supabase client covering exactly the query-builder surface
 * upsertWithCounts() uses: from(table).select(cols).in(col, vals).order(col, opts).range(from, to)
 * for the existing-keys lookup (scoped to every distinct value of the batch's first key column,
 * not just one, and paginated past PostgREST's 1000-row cap - see upsertHelper.ts), and
 * from(table).upsert(rows, opts) for the write. This lets the idempotency accounting logic
 * (created vs. updated counts) be verified without a live database, per spec §17.
 *
 * .order()/.range() are chainable no-ops that return all of `existingRows` on every call - fine
 * for these tests since existingRows is always far short of the real 1000-row page size, so the
 * pagination loop always terminates after a single page.
 */
function makeFakeSupabase(existingRows: Record<string, unknown>[]) {
  const upsertCalls: Array<{ table: string; rows: unknown[]; opts: unknown }> = [];
  const inCalls: Array<{ col: string; values: unknown[] }> = [];

  const client = {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        in: vi.fn((col: string, values: unknown[]) => {
          inCalls.push({ col, values });
          return {
            order: vi.fn(() => ({
              range: vi.fn(async () => ({ data: existingRows, error: null })),
            })),
          };
        }),
      })),
      upsert: vi.fn(async (rows: unknown[], opts: unknown) => {
        upsertCalls.push({ table, rows, opts });
        return { error: null };
      }),
    })),
  };

  return { client, upsertCalls, inCalls };
}

describe('upsertWithCounts (idempotent upsert accounting)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('counts brand-new rows as created when nothing exists yet', async () => {
    const { client } = makeFakeSupabase([]);
    vi.doMock('../../../src/database/supabaseClient.js', () => ({ supabaseAdmin: client }));
    const { upsertWithCounts } = await import('../../../src/utils/upsertHelper.js');

    const counts = await upsertWithCounts({
      table: 'meta_ad_daily_metrics' as never,
      rows: [
        { client_id: 'client-a', ad_id: 'ad-1', date: '2026-08-10', impressions: 100 },
        { client_id: 'client-a', ad_id: 'ad-2', date: '2026-08-10', impressions: 200 },
      ] as never,
      onConflict: 'ad_id,date',
      keyColumns: ['ad_id', 'date'],
    });

    expect(counts).toEqual({ created: 2, updated: 0 });
  });

  it('counts rows matching an existing (ad_id, date) key as updated, not created - re-syncing the same day does not duplicate', async () => {
    const { client, upsertCalls } = makeFakeSupabase([{ ad_id: 'ad-1', date: '2026-08-10' }]);
    vi.doMock('../../../src/database/supabaseClient.js', () => ({ supabaseAdmin: client }));
    const { upsertWithCounts } = await import('../../../src/utils/upsertHelper.js');

    const counts = await upsertWithCounts({
      table: 'meta_ad_daily_metrics' as never,
      rows: [
        { client_id: 'client-a', ad_id: 'ad-1', date: '2026-08-10', impressions: 150 }, // same key, new value -> update
        { client_id: 'client-a', ad_id: 'ad-2', date: '2026-08-10', impressions: 200 }, // new key -> create
      ] as never,
      onConflict: 'ad_id,date',
      keyColumns: ['ad_id', 'date'],
    });

    expect(counts).toEqual({ created: 1, updated: 1 });
    // The actual write still goes through upsert (not insert), so a retry of
    // an identical sync run is a no-op rather than a duplicate row.
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0]!.opts).toEqual({ onConflict: 'ad_id,date' });
  });

  it('running the same upsert twice in a row is idempotent: second run reports 0 created', async () => {
    // First run: nothing exists yet.
    const { client: firstClient } = makeFakeSupabase([]);
    vi.doMock('../../../src/database/supabaseClient.js', () => ({ supabaseAdmin: firstClient }));
    const { upsertWithCounts: firstUpsert } = await import('../../../src/utils/upsertHelper.js');

    const rows = [{ client_id: 'client-a', meritto_lead_id: 'MER-1', created_at_source: '2026-08-10T00:00:00Z' }];
    const firstRun = await firstUpsert({
      table: 'meritto_leads' as never,
      rows: rows as never,
      onConflict: 'client_id,meritto_lead_id',
      keyColumns: ['client_id', 'meritto_lead_id'],
    });
    expect(firstRun).toEqual({ created: 1, updated: 0 });

    // Second run: the row from the first run now "exists".
    vi.resetModules();
    const { client: secondClient } = makeFakeSupabase([{ client_id: 'client-a', meritto_lead_id: 'MER-1' }]);
    vi.doMock('../../../src/database/supabaseClient.js', () => ({ supabaseAdmin: secondClient }));
    const { upsertWithCounts: secondUpsert } = await import('../../../src/utils/upsertHelper.js');

    const secondRun = await secondUpsert({
      table: 'meritto_leads' as never,
      rows: rows as never,
      onConflict: 'client_id,meritto_lead_id',
      keyColumns: ['client_id', 'meritto_lead_id'],
    });
    expect(secondRun).toEqual({ created: 0, updated: 1 });
  });

  it('scopes the existing-key lookup by every distinct value in the batch, not just the first row', async () => {
    // Regression test: an earlier version scoped the existing-rows lookup to
    // only rows[0]'s first-key-column value (here, ad-1), which would
    // silently misreport ad-2/ad-3's already-existing rows as "created" on
    // every single re-sync since they were never looked up at all.
    const { client, inCalls } = makeFakeSupabase([
      { ad_id: 'ad-1', date: '2026-08-10' },
      { ad_id: 'ad-2', date: '2026-08-10' },
      { ad_id: 'ad-3', date: '2026-08-10' },
    ]);
    vi.doMock('../../../src/database/supabaseClient.js', () => ({ supabaseAdmin: client }));
    const { upsertWithCounts } = await import('../../../src/utils/upsertHelper.js');

    const counts = await upsertWithCounts({
      table: 'meta_ad_daily_metrics' as never,
      rows: [
        { client_id: 'client-a', ad_id: 'ad-1', date: '2026-08-10', impressions: 100 },
        { client_id: 'client-a', ad_id: 'ad-2', date: '2026-08-10', impressions: 200 },
        { client_id: 'client-a', ad_id: 'ad-3', date: '2026-08-10', impressions: 300 },
      ] as never,
      onConflict: 'ad_id,date',
      keyColumns: ['ad_id', 'date'],
    });

    expect(counts).toEqual({ created: 0, updated: 3 });
    expect(inCalls[0]!.col).toBe('ad_id');
    expect(new Set(inCalls[0]!.values)).toEqual(new Set(['ad-1', 'ad-2', 'ad-3']));
  });

  it('is a no-op for an empty batch (does not call upsert at all)', async () => {
    const { client, upsertCalls } = makeFakeSupabase([]);
    vi.doMock('../../../src/database/supabaseClient.js', () => ({ supabaseAdmin: client }));
    const { upsertWithCounts } = await import('../../../src/utils/upsertHelper.js');

    const counts = await upsertWithCounts({
      table: 'meta_ad_daily_metrics' as never,
      rows: [],
      onConflict: 'ad_id,date',
      keyColumns: ['ad_id', 'date'],
    });

    expect(counts).toEqual({ created: 0, updated: 0 });
    expect(upsertCalls).toHaveLength(0);
  });
});
