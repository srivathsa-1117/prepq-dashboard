import { getCreativeFatigueRows, getLeadCountsInWindow } from '../repositories/reportingRepo.js';
import { creativeFatigue, type FatigueResult, type FatigueTrend } from './metricCalculations.js';
import { FATIGUE_WINDOW_DAYS } from '../config/constants.js';

/**
 * Fatigue for the creative grid/list is sourced directly from the live
 * project's own v_creative_performance view (trailing 14d vs preceding 14d
 * qualified rate, suppressed below 10 leads per window - see migrations
 * 0023/0024 in the connected Supabase project). It is always "as of today",
 * independent of the dashboard's selected date range, matching spec §14/§15
 * exactly - no need to recompute the same windowing logic in TypeScript for
 * every creative in a list.
 */
export async function getCreativeFatigueMap(clientId: string, creativeIds: string[]): Promise<Map<string, FatigueResult>> {
  const rows = await getCreativeFatigueRows(clientId, creativeIds);

  const map = new Map<string, FatigueResult>();
  for (const row of rows) {
    if (!row.creative_id) continue;
    map.set(row.creative_id, {
      trend: (row.fatigue_status as FatigueTrend) ?? 'insufficient_data',
      currentWindowRate: null,
      previousWindowRate: null,
      deltaPp: row.fatigue_change_pp,
    });
  }
  return map;
}

/** Trailing 14 days ending `asOf`, and the 14 days immediately before that. */
export function fatigueWindows(asOf: string): { current: { from: string; to: string }; previous: { from: string; to: string } } {
  const toDate = new Date(`${asOf}T00:00:00.000Z`);

  const currentFrom = new Date(toDate);
  currentFrom.setUTCDate(currentFrom.getUTCDate() - (FATIGUE_WINDOW_DAYS - 1));

  const previousTo = new Date(currentFrom);
  previousTo.setUTCDate(previousTo.getUTCDate() - 1);
  const previousFrom = new Date(previousTo);
  previousFrom.setUTCDate(previousFrom.getUTCDate() - (FATIGUE_WINDOW_DAYS - 1));

  const iso = (d: Date) => d.toISOString().slice(0, 10);

  return {
    current: { from: iso(currentFrom), to: iso(toDate) },
    previous: { from: iso(previousFrom), to: iso(previousTo) },
  };
}

/**
 * The single-creative detail drawer needs the actual recent/prior lead and
 * qualified counts, not just a precomputed status word - two lightweight
 * queries are fine here since it's one creative at a time (unlike the grid,
 * which batches via v_creative_performance instead).
 */
export async function getCreativeFatigueDetail(
  clientId: string,
  creativeId: string,
  asOf: string,
): Promise<FatigueResult & { currentWindow: { from: string; to: string; leads: number; qualified: number }; previousWindow: { from: string; to: string; leads: number; qualified: number } }> {
  const windows = fatigueWindows(asOf);

  const [current, previous] = await Promise.all([
    getLeadCountsInWindow(clientId, creativeId, windows.current.from, windows.current.to),
    getLeadCountsInWindow(clientId, creativeId, windows.previous.from, windows.previous.to),
  ]);

  const result = creativeFatigue(current, previous);

  return {
    ...result,
    currentWindow: { ...windows.current, ...current },
    previousWindow: { ...windows.previous, ...previous },
  };
}
