'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AsyncSection } from '@/components/common/AsyncSection';
import { useSales } from '@/lib/hooks/useDashboardData';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import type { DashboardFilterState } from '@/lib/hooks/useDashboardFilters';
import { formatNumber, formatPercent } from '@/lib/utils/format';
import { chartColor } from '@/lib/utils/colors';

const STATUS_LABEL: Record<string, string> = {
  qualified: 'Qualified',
  not_qualified: 'Not qualified',
  not_reachable: 'No Response',
  junk: 'Junk',
  uncalled: 'No Activity / No Log',
};

const STATUS_COLOR: Record<string, string> = {
  qualified: chartColor.good,
  not_qualified: chartColor.warning,
  not_reachable: chartColor.serious,
  junk: chartColor.critical,
  uncalled: chartColor.baseline,
};

export function LeadQuality({ filters }: { filters: DashboardFilterState }) {
  const { selectedClientId } = useOrgClient();
  const query = useSales(selectedClientId, filters);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lead quality</CardTitle>
      </CardHeader>
      <CardContent>
        <AsyncSection isLoading={query.isLoading} isError={query.isError} data={query.data} onRetry={() => query.refetch()} isEmpty={(d) => d.leadQuality.every((s) => s.count === 0)}>
          {(data) => (
            <div className="flex flex-col gap-2.5">
              {data.leadQuality.map((s) => (
                <div key={s.status} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{STATUS_LABEL[s.status] ?? s.status}</span>
                  <div className="relative h-5 flex-1 rounded-sm bg-chip">
                    <div className="h-5 rounded-sm" style={{ width: `${Math.max(2, s.pctOfTotal * 100)}%`, backgroundColor: STATUS_COLOR[s.status] ?? chartColor.baseline }} />
                  </div>
                  <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-foreground">{formatNumber(s.count)}</span>
                  <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{formatPercent(s.pctOfTotal)}</span>
                </div>
              ))}
            </div>
          )}
        </AsyncSection>
      </CardContent>
    </Card>
  );
}
