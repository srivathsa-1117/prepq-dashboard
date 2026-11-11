/**
 * Deliberately no "sum the already-fetched rows" helper here anymore - that approach silently
 * dropped leads with no campaign/creative-level match from the Campaigns/Creatives KPI strips
 * (rows only cover attributed leads by design). Both pages now get their totals straight from the
 * API's `totals` field (CampaignPerformanceResponse/CreativePerformanceResponse), which is computed
 * from the full matching lead set independent of attribution. Keep it that way - don't reintroduce
 * a client-side row sum for Leads/Qualified/Enrolled/Revenue.
 */

export function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

export function divide(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}
