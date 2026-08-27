'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AsyncSection } from '@/components/common/AsyncSection';
import { useSales } from '@/lib/hooks/useDashboardData';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import type { DashboardFilterState } from '@/lib/hooks/useDashboardFilters';
import { formatNumber } from '@/lib/utils/format';

export function FollowupDepth({ filters }: { filters: DashboardFilterState }) {
  const { selectedClientId } = useOrgClient();
  const query = useSales(selectedClientId, filters);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Follow-up depth</CardTitle>
      </CardHeader>
      <CardContent>
        <AsyncSection
          isLoading={query.isLoading}
          isError={query.isError}
          data={query.data}
          onRetry={() => query.refetch()}
          isEmpty={(d) => Object.keys(d.followUpDepth.byAttempt).length === 0 && d.followUpDepth.neverConnected === 0}
        >
          {(data) => {
            const entries = Object.entries(data.followUpDepth.byAttempt).sort(([a], [b]) => Number(a) - Number(b));
            const max = Math.max(...entries.map(([, v]) => v), data.followUpDepth.neverConnected, 1);
            return (
              <div className="flex flex-col gap-2.5">
                {entries.map(([attempt, count]) => (
                  <div key={attempt} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-xs text-muted-foreground">Attempt {attempt}</span>
                    <div className="relative h-5 flex-1 rounded-sm bg-chip">
                      <div className="h-5 rounded-sm bg-primary" style={{ width: `${Math.max(2, (count / max) * 100)}%` }} />
                    </div>
                    <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-foreground">{formatNumber(count)}</span>
                  </div>
                ))}
                <div className="flex items-center gap-3 border-t border-border pt-2">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">Never connected</span>
                  <div className="relative h-5 flex-1 rounded-sm bg-chip">
                    <div
                      className="h-5 rounded-sm bg-critical"
                      style={{ width: `${Math.max(2, (data.followUpDepth.neverConnected / max) * 100)}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-foreground">
                    {formatNumber(data.followUpDepth.neverConnected)}
                  </span>
                </div>
              </div>
            );
          }}
        </AsyncSection>
      </CardContent>
    </Card>
  );
}
