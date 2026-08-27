'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AsyncSection } from '@/components/common/AsyncSection';
import { useFunnel } from '@/lib/hooks/useDashboardData';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import type { DashboardFilterState } from '@/lib/hooks/useDashboardFilters';
import { formatNumber, formatPercent } from '@/lib/utils/format';
import { chartColor } from '@/lib/utils/colors';

const STAGE_LABELS: Record<string, string> = {
  leads: 'Leads',
  connected: 'Connected',
  qualified: 'Qualified',
  demo_booked: 'Demo booked',
  demo_attended: 'Demo attended',
  enrolled: 'Enrolled',
};

/** 6-stage funnel (spec §6) - width scaled to pctOfTotal, drop-off vs the previous stage shown alongside. */
export function Funnel({ filters }: { filters: DashboardFilterState }) {
  const { selectedClientId } = useOrgClient();
  const query = useFunnel(selectedClientId, filters);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Funnel</CardTitle>
      </CardHeader>
      <CardContent>
        <AsyncSection
          isLoading={query.isLoading}
          isError={query.isError}
          data={query.data}
          onRetry={() => query.refetch()}
          isEmpty={(d) => d.stages.every((s) => s.count === 0)}
        >
          {(data) => {
            const max = Math.max(...data.stages.map((s) => s.count), 1);
            return (
              <div className="flex flex-col gap-2.5">
                {data.stages.map((stage, i) => (
                  <div key={stage.stage} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-xs text-muted-foreground">{STAGE_LABELS[stage.stage] ?? stage.stage}</span>
                    <div className="relative h-6 flex-1 rounded-sm bg-chip">
                      <div
                        className="h-6 rounded-sm transition-all"
                        style={{ width: `${Math.max(2, (stage.count / max) * 100)}%`, backgroundColor: chartColor.funnel[i] ?? chartColor.primary }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right text-xs font-medium tabular-nums text-foreground">{formatNumber(stage.count)}</span>
                    <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {stage.pctOfPrevious !== null ? formatPercent(stage.pctOfPrevious) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            );
          }}
        </AsyncSection>
      </CardContent>
    </Card>
  );
}
