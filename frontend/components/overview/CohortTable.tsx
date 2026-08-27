'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AsyncSection } from '@/components/common/AsyncSection';
import { useSales } from '@/lib/hooks/useDashboardData';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import type { DashboardFilterState } from '@/lib/hooks/useDashboardFilters';
import { formatNumber, formatPercent } from '@/lib/utils/format';

const MATURITY_LABEL: Record<string, { label: string; variant: 'good' | 'warning' | 'default' }> = {
  matured: { label: 'Matured', variant: 'good' },
  mostly_matured: { label: 'Mostly matured', variant: 'warning' },
  still_maturing: { label: 'Still maturing', variant: 'default' },
};

/** Cohort conversion ignores the date-range filter by design (spec §15) - always shows the full monthly cohort history so maturity read remains stable. */
export function CohortTable({ filters }: { filters: DashboardFilterState }) {
  const { selectedClientId } = useOrgClient();
  const query = useSales(selectedClientId, filters);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cohort conversion</CardTitle>
      </CardHeader>
      <CardContent>
        <AsyncSection isLoading={query.isLoading} isError={query.isError} data={query.data} onRetry={() => query.refetch()} isEmpty={(d) => d.cohortConversion.length === 0}>
          {(data) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Enrolled</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead>Maturity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.cohortConversion.map((c) => {
                  const maturity = MATURITY_LABEL[c.maturity] ?? { label: c.maturity, variant: 'default' as const };
                  return (
                    <TableRow key={c.month}>
                      <TableCell className="font-medium text-foreground">{c.month}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(c.leads)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(c.enrolled)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPercent(c.enrolledRate)}</TableCell>
                      <TableCell>
                        <Badge variant={maturity.variant}>{maturity.label}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </AsyncSection>
      </CardContent>
    </Card>
  );
}
