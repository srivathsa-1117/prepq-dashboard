'use client';

import { MetricCard } from '@/components/overview/MetricCard';
import { AsyncSection } from '@/components/common/AsyncSection';
import { useCampaignPerformance } from '@/lib/hooks/useDashboardData';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import type { DashboardFilterState } from '@/lib/hooks/useDashboardFilters';
import { formatCurrencyCompact, formatMultiplier, formatNumber, formatPercent } from '@/lib/utils/format';
import * as calc from '@/lib/utils/campaignTotals';

/** Overview totals row above the campaign table (spec §7) - summed client-side from the already-fetched per-campaign rows, not a separate API call. */
export function CampaignKpis({ filters }: { filters: DashboardFilterState }) {
  const { selectedClientId } = useOrgClient();
  const query = useCampaignPerformance(selectedClientId, filters);

  return (
    <AsyncSection
      isLoading={query.isLoading}
      isError={query.isError}
      data={query.data}
      onRetry={() => query.refetch()}
      isEmpty={(d) => d.campaigns.length === 0}
      skeleton={
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-chip" />
          ))}
        </div>
      }
    >
      {(data) => {
        const t = calc.sumCampaignTotals(data.campaigns);
        return (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <MetricCard label="Campaigns" value={formatNumber(data.campaigns.length)} />
            <MetricCard label="Spend" value={formatCurrencyCompact(t.spend)} />
            <MetricCard label="Leads" value={formatNumber(t.leads)} />
            <MetricCard label="Qualified rate" value={formatPercent(calc.rate(t.qualified, t.leads))} />
            <MetricCard label="Enrolled" value={formatNumber(t.enrolled)} />
            <MetricCard label="Revenue" value={formatCurrencyCompact(t.revenue)} />
            <MetricCard label="CPL" value={formatCurrencyCompact(calc.divide(t.spend, t.leads))} />
            <MetricCard label="ROAS" value={formatMultiplier(calc.divide(t.revenue, t.spend))} />
          </div>
        );
      }}
    </AsyncSection>
  );
}
