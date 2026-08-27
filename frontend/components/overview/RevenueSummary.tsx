'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AsyncSection } from '@/components/common/AsyncSection';
import { useRevenue } from '@/lib/hooks/useDashboardData';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import type { DashboardFilterState } from '@/lib/hooks/useDashboardFilters';
import { formatCurrencyCompact, formatMultiplier, formatNumber } from '@/lib/utils/format';
import { courseColor } from '@/lib/utils/colors';

export function RevenueSummary({ filters }: { filters: DashboardFilterState }) {
  const { selectedClientId } = useOrgClient();
  const query = useRevenue(selectedClientId, filters);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenue by course</CardTitle>
      </CardHeader>
      <CardContent>
        <AsyncSection isLoading={query.isLoading} isError={query.isError} data={query.data} onRetry={() => query.refetch()} isEmpty={(d) => d.byCourse.length === 0}>
          {(data) => (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-xs text-muted-foreground">Total revenue</p>
                  <p className="text-xl font-semibold tabular-nums text-foreground">{formatCurrencyCompact(data.totalRevenue)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total spend</p>
                  <p className="text-xl font-semibold tabular-nums text-foreground">{formatCurrencyCompact(data.totalSpend)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Blended ROAS</p>
                  <p className="text-xl font-semibold tabular-nums text-foreground">{formatMultiplier(data.blendedRoas)}</p>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Course</TableHead>
                    <TableHead className="text-right">Enrolled</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Cost / enrollment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byCourse.map((c) => (
                    <TableRow key={c.courseId}>
                      <TableCell className="flex items-center gap-2 font-medium text-foreground">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: courseColor(c.courseCode) }} />
                        {c.courseName ?? c.courseCode ?? c.courseId}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(c.enrolled)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrencyCompact(c.revenue)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrencyCompact(c.costPerEnrollment)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </AsyncSection>
      </CardContent>
    </Card>
  );
}
