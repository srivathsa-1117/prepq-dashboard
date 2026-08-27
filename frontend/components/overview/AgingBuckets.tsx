'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AsyncSection } from '@/components/common/AsyncSection';
import { useSales } from '@/lib/hooks/useDashboardData';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import type { DashboardFilterState } from '@/lib/hooks/useDashboardFilters';
import { formatNumber } from '@/lib/utils/format';
import { chartColor } from '@/lib/utils/colors';

const BUCKET_COLOR: Record<string, string> = { '<24h': chartColor.good, '24-48h': chartColor.warning, '>48h': chartColor.critical };

/** Uncalled lead queue is a live backlog, deliberately not affected by the date range filter (spec §15). */
export function AgingBuckets({ filters }: { filters: DashboardFilterState }) {
  const { selectedClientId } = useOrgClient();
  const query = useSales(selectedClientId, filters);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Uncalled aging</CardTitle>
      </CardHeader>
      <CardContent>
        <AsyncSection
          isLoading={query.isLoading}
          isError={query.isError}
          data={query.data}
          onRetry={() => query.refetch()}
          isEmpty={(d) => d.uncalledAging.buckets.every((b) => b.leads === 0)}
        >
          {(data) => {
            const max = Math.max(...data.uncalledAging.buckets.map((b) => b.leads), 1);
            return (
              <div className="flex flex-col gap-2.5">
                {data.uncalledAging.buckets.map((b) => (
                  <div key={b.bucket} className="flex items-center gap-3">
                    <span className="w-14 shrink-0 text-xs text-muted-foreground">{b.bucket}</span>
                    <div className="relative h-5 flex-1 rounded-sm bg-chip">
                      <div
                        className="h-5 rounded-sm"
                        style={{ width: `${Math.max(2, (b.leads / max) * 100)}%`, backgroundColor: BUCKET_COLOR[b.bucket] ?? chartColor.baseline }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-foreground">{formatNumber(b.leads)}</span>
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
