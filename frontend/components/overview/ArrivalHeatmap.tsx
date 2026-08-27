'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AsyncSection } from '@/components/common/AsyncSection';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useSales } from '@/lib/hooks/useDashboardData';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import type { DashboardFilterState } from '@/lib/hooks/useDashboardFilters';
import { sequentialColorForRatio } from '@/lib/utils/colors';
import { formatNumber, formatPercent } from '@/lib/utils/format';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Lead-arrival heatmap by day-of-week × time block (spec §9 marketing signals). Color intensity is lead volume; tooltip carries connect rate. */
export function ArrivalHeatmap({ filters }: { filters: DashboardFilterState }) {
  const { selectedClientId } = useOrgClient();
  const query = useSales(selectedClientId, filters);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Arrival heatmap</CardTitle>
      </CardHeader>
      <CardContent>
        <AsyncSection
          isLoading={query.isLoading}
          isError={query.isError}
          data={query.data}
          onRetry={() => query.refetch()}
          // A CRM that doesn't track a real per-lead creation *time* (only date - see
          // merittoTransform.ts's deriveCreatedAtFromLeadAge) makes every lead land in the same
          // single hour bucket here, which would render as a fake "everyone arrives at exactly
          // 3am" pattern - actively misleading, not just sparse. Detected generically (not by
          // provider name) so this stays correct if the account's data ever gains real
          // timestamps: real arrival data is never this concentrated in one bucket across every
          // day of the week.
          isEmpty={(d) => new Set(d.arrivalHeatmap.filter((c) => c.leads > 0).map((c) => c.blockStartHour)).size <= 1}
          emptyMessage="Your CRM doesn't track the time of day leads arrive, only the date - this chart needs that to be meaningful."
        >
          {(data) => {
            const blocks = Array.from(new Set(data.arrivalHeatmap.map((c) => c.blockStartHour))).sort((a, b) => a - b);
            const cellFor = (day: number, hour: number) => data.arrivalHeatmap.find((c) => c.dayOfWeek === day && c.blockStartHour === hour);
            const max = Math.max(...data.arrivalHeatmap.map((c) => c.leads), 1);
            return (
              <TooltipProvider>
                <div className="overflow-x-auto">
                  <div className="grid gap-0.5" style={{ gridTemplateColumns: `2.5rem repeat(${blocks.length}, minmax(1.5rem, 1fr))` }}>
                    <div />
                    {blocks.map((h) => (
                      <div key={h} className="text-center text-[10px] text-muted-foreground">
                        {h}
                      </div>
                    ))}
                    {DAY_LABELS.map((label, day) => (
                      <div key={label} className="contents">
                        <div className="flex items-center text-[10px] text-muted-foreground">{label}</div>
                        {blocks.map((hour) => {
                          const cell = cellFor(day, hour);
                          const ratio = cell ? cell.leads / max : 0;
                          return (
                            <Tooltip key={hour}>
                              <TooltipTrigger asChild>
                                <div
                                  className="aspect-square rounded-sm"
                                  style={{ backgroundColor: cell && cell.leads > 0 ? sequentialColorForRatio(ratio) : 'var(--chip)' }}
                                />
                              </TooltipTrigger>
                              <TooltipContent>
                                {label} {hour}:00 — {formatNumber(cell?.leads ?? 0)} leads, {formatPercent(cell?.connectRate ?? 0)} connect
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </TooltipProvider>
            );
          }}
        </AsyncSection>
      </CardContent>
    </Card>
  );
}
