'use client';

import { Card, CardContent } from '@/components/ui/card';
import { AsyncSection } from '@/components/common/AsyncSection';
import { useCreativePerformance } from '@/lib/hooks/useDashboardData';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import type { DashboardFilterState } from '@/lib/hooks/useDashboardFilters';
import { formatCurrencyCompact, formatMultiplier, formatNumber, formatPercent } from '@/lib/utils/format';
import * as calc from '@/lib/utils/campaignTotals';

/** Hero KPI strip above the creative grid (spec §8) - large, visual summary rather than another dense table. */
export function CreativeHeroKpis({ filters }: { filters: DashboardFilterState }) {
  const { selectedClientId } = useOrgClient();
  const query = useCreativePerformance(selectedClientId, filters);

  return (
    <AsyncSection
      isLoading={query.isLoading}
      isError={query.isError}
      data={query.data}
      onRetry={() => query.refetch()}
      isEmpty={(d) => d.creatives.length === 0}
      skeleton={<div className="h-28 w-full animate-pulse rounded-lg bg-chip" />}
    >
      {(data) => {
        const live = data.creatives.filter((c) => c.status === 'active');
        const fatiguing = data.creatives.filter((c) => c.fatigue?.trend === 'declining').length;
        const t = calc.sumCampaignTotals(data.creatives);
        return (
          <Card>
            <CardContent className="grid grid-cols-2 gap-4 py-5 sm:grid-cols-3 lg:grid-cols-6">
              <Hero label="Total creatives" value={formatNumber(data.creatives.length)} />
              <Hero label="Live" value={formatNumber(live.length)} />
              <Hero label="Fatiguing" value={formatNumber(fatiguing)} tone={fatiguing > 0 ? 'critical' : undefined} />
              <Hero label="Spend" value={formatCurrencyCompact(t.spend)} />
              <Hero label="Qualified rate" value={formatPercent(calc.rate(t.qualified, t.leads))} />
              <Hero label="ROAS" value={formatMultiplier(calc.divide(t.revenue, t.spend))} />
            </CardContent>
          </Card>
        );
      }}
    </AsyncSection>
  );
}

function Hero({ label, value, tone }: { label: string; value: string; tone?: 'critical' }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${tone === 'critical' ? 'text-critical' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}
