'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AsyncSection } from '@/components/common/AsyncSection';
import { useSales } from '@/lib/hooks/useDashboardData';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import type { DashboardFilterState } from '@/lib/hooks/useDashboardFilters';
import { formatDuration, formatNumber, formatPercent } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

/** Sorted by lead-to-enrolment rate descending (see backend salesTeamBreakdown) - uncalledOver24h comes from the live queue, not the ranged leads. */
export function SalesTeamTable({ filters }: { filters: DashboardFilterState }) {
  const { selectedClientId } = useOrgClient();
  const query = useSales(selectedClientId, filters);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sales team</CardTitle>
      </CardHeader>
      <CardContent>
        <AsyncSection isLoading={query.isLoading} isError={query.isError} data={query.data} onRetry={() => query.refetch()} isEmpty={(d) => d.salesTeam.length === 0}>
          {(data) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-right">Assigned</TableHead>
                  <TableHead className="text-right">Median response</TableHead>
                  <TableHead className="text-right">&gt;24h uncalled</TableHead>
                  <TableHead className="text-right">Connected</TableHead>
                  <TableHead className="text-right">Qualified</TableHead>
                  <TableHead className="text-right">Enrolled</TableHead>
                  <TableHead className="text-right">Lead→Enrol.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.salesTeam.map((row) => (
                  <TableRow key={row.owner}>
                    <TableCell className="font-medium text-foreground">{row.owner}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(row.leadsAssigned)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatDuration(row.medianResponseHours)}</TableCell>
                    <TableCell className={cn('text-right tabular-nums', row.uncalledOver24h > 0 && 'font-medium text-critical')}>
                      {formatNumber(row.uncalledOver24h)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(row.connected)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(row.qualified)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(row.enrolled)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-foreground">{formatPercent(row.leadToEnrolmentRate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </AsyncSection>
      </CardContent>
    </Card>
  );
}
