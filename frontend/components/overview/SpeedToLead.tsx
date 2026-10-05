'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AsyncSection } from '@/components/common/AsyncSection';
import { useSales } from '@/lib/hooks/useDashboardData';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import type { DashboardFilterState } from '@/lib/hooks/useDashboardFilters';
import { formatDuration, formatNumber, formatPercent } from '@/lib/utils/format';

export function SpeedToLead({ filters }: { filters: DashboardFilterState }) {
  const { selectedClientId } = useOrgClient();
  const query = useSales(selectedClientId, filters);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Speed to lead</CardTitle>
      </CardHeader>
      <CardContent>
        <AsyncSection
          isLoading={query.isLoading}
          isError={query.isError}
          data={query.data}
          onRetry={() => query.refetch()}
          isEmpty={(d) => d.speedToLead.buckets.every((b) => b.leads === 0)}
        >
          {(data) => (
            <div className="flex flex-col gap-3">
              <div className="text-xl font-semibold tabular-nums text-foreground">{formatDuration(data.speedToLead.medianHours)}</div>
              <p className="text-xs text-muted-foreground">Median time to first call</p>
              <div className="mt-1 flex flex-col gap-1.5">
                {data.speedToLead.buckets.map((b) => (
                  <div key={b.bucket} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{b.bucket}</span>
                    <span className="tabular-nums text-foreground">
                      {formatNumber(b.leads)} leads · {formatPercent(b.connectRate)} connect
                    </span>
                  </div>
                ))}
              </div>
              {(data.speedToLead.neverCalled > 0 || data.speedToLead.notTimeable > 0) && (
                <div className="mt-1 flex flex-col gap-1.5 border-t border-border pt-2">
                  {data.speedToLead.neverCalled > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Never called</span>
                      <span className="tabular-nums text-foreground">{formatNumber(data.speedToLead.neverCalled)} leads</span>
                    </div>
                  )}
                  {data.speedToLead.notTimeable > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground" title="Called, but Meritto only gives us the lead's creation day (not the exact time), so we can't tell how many hours passed before the first call.">
                        Called, timing unclear
                      </span>
                      <span className="tabular-nums text-foreground">{formatNumber(data.speedToLead.notTimeable)} leads</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </AsyncSection>
      </CardContent>
    </Card>
  );
}
