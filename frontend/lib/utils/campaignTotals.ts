import type { CampaignRow, CreativeRow } from '../types/api';

export interface RowTotals {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  qualified: number;
  enrolled: number;
  revenue: number;
}

/** Client-side aggregation over already-fetched per-campaign/per-creative rows - avoids a duplicate "totals" API call for data the page already has. */
export function sumCampaignTotals(rows: Array<CampaignRow | CreativeRow>): RowTotals {
  return rows.reduce<RowTotals>(
    (acc, r) => ({
      spend: acc.spend + r.spend,
      impressions: acc.impressions + r.impressions,
      clicks: acc.clicks + r.clicks,
      leads: acc.leads + r.leads,
      qualified: acc.qualified + r.qualified,
      enrolled: acc.enrolled + r.enrolled,
      revenue: acc.revenue + r.revenue,
    }),
    { spend: 0, impressions: 0, clicks: 0, leads: 0, qualified: 0, enrolled: 0, revenue: 0 },
  );
}

export function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

export function divide(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}
