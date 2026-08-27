'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AsyncSection } from '@/components/common/AsyncSection';
import { useSales } from '@/lib/hooks/useDashboardData';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import type { DashboardFilterState } from '@/lib/hooks/useDashboardFilters';
import { formatNumber, formatPercent } from '@/lib/utils/format';

/** Reasons are whatever the client's CRM has configured - never a hardcoded list (see backend disqualificationReasons()). */
export function DisqualificationReasons({ filters }: { filters: DashboardFilterState }) {
  const { selectedClientId } = useOrgClient();
  const query = useSales(selectedClientId, filters);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Disqualification reasons</CardTitle>
      </CardHeader>
      <CardContent>
        <AsyncSection
          isLoading={query.isLoading}
          isError={query.isError}
          data={query.data}
          onRetry={() => query.refetch()}
          isEmpty={(d) => d.disqualificationReasons.length === 0}
          emptyMessage="No disqualified leads in this period."
        >
          {(data) => {
            const max = Math.max(...data.disqualificationReasons.map((r) => r.count), 1);
            return (
              <div className="flex flex-col gap-2.5">
                {data.disqualificationReasons.slice(0, 8).map((r) => (
                  <div key={r.reason} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 truncate text-xs text-muted-foreground" title={r.reason}>
                      {r.reason}
                    </span>
                    <div className="relative h-5 flex-1 rounded-sm bg-chip">
                      <div className="h-5 rounded-sm bg-serious" style={{ width: `${Math.max(2, (r.count / max) * 100)}%` }} />
                    </div>
                    <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-foreground">{formatNumber(r.count)}</span>
                    <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{formatPercent(r.pctOfDisqualified)}</span>
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
