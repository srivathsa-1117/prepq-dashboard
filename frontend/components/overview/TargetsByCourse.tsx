'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AsyncSection } from '@/components/common/AsyncSection';
import { ProgressRow } from '@/components/overview/ProgressRow';
import { useOverview } from '@/lib/hooks/useDashboardData';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import type { DashboardFilterState } from '@/lib/hooks/useDashboardFilters';
import { formatCurrencyCompact, formatNumber } from '@/lib/utils/format';

export function TargetsByCourse({ filters }: { filters: DashboardFilterState }) {
  const { selectedClientId } = useOrgClient();
  const query = useOverview(selectedClientId, filters);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Targets by course (this month)</CardTitle>
      </CardHeader>
      <CardContent>
        <AsyncSection
          isLoading={query.isLoading}
          isError={query.isError}
          data={query.data}
          onRetry={() => query.refetch()}
          isEmpty={(d) => d.targetsByCourse.length === 0}
          emptyMessage="No targets set for this month yet."
        >
          {(data) => (
            <div className="flex flex-col gap-6">
              {data.targetsByCourse.map((c) => (
                <div key={c.courseId} className="flex flex-col gap-3 border-b border-border pb-5 last:border-0 last:pb-0">
                  <span className="text-sm font-medium text-foreground">{c.courseName}</span>
                  <ProgressRow label="Leads" target={c.leads.target} actual={c.leads.actual} format={formatNumber} />
                  <ProgressRow label="Qualified" target={c.qualified.target} actual={c.qualified.actual} format={formatNumber} />
                  <ProgressRow label="Enrolled" target={c.enrolled.target} actual={c.enrolled.actual} format={formatNumber} />
                  <ProgressRow label="Revenue" target={c.revenue.target} actual={c.revenue.actual} format={formatCurrencyCompact} />
                </div>
              ))}
            </div>
          )}
        </AsyncSection>
      </CardContent>
    </Card>
  );
}
