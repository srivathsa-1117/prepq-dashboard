'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AsyncSection } from '@/components/common/AsyncSection';
import { useSales } from '@/lib/hooks/useDashboardData';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import type { DashboardFilterState } from '@/lib/hooks/useDashboardFilters';
import type { SalesResponse } from '@/lib/types/api';
import { formatDuration, formatNumber, formatPercent } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

type SalesTeamRow = SalesResponse['salesTeam'][number];
type SortKey = keyof Pick<
  SalesTeamRow,
  'owner' | 'leadsAssigned' | 'medianResponseHours' | 'uncalledOver24h' | 'connected' | 'qualified' | 'enrolled' | 'leadToEnrolmentRate'
>;

const COLUMNS: Array<{ key: SortKey; label: string; align?: 'right'; title?: string }> = [
  { key: 'owner', label: 'Owner' },
  { key: 'leadsAssigned', label: 'Assigned', align: 'right', title: 'Leads created within the selected date range' },
  { key: 'medianResponseHours', label: 'Median response', align: 'right' },
  {
    key: 'uncalledOver24h',
    label: '>24h uncalled',
    align: 'right',
    title: "This owner's never-called leads older than 24h, among leads created within the selected date range - same window as \"Assigned\".",
  },
  { key: 'connected', label: 'Connected', align: 'right' },
  { key: 'qualified', label: 'Qualified', align: 'right' },
  { key: 'enrolled', label: 'Enrolled', align: 'right' },
  { key: 'leadToEnrolmentRate', label: 'Lead→Enrol.', align: 'right' },
];

/** uncalledOver24h now comes from the same date-range-scoped queue as the rest of this table (see reportingRepo.ts::getUncalledLeads) - no longer an all-time backlog. Default sort matches its prior fixed order (lead-to-enrolment rate descending); click any header to re-sort. */
export function SalesTeamTable({ filters }: { filters: DashboardFilterState }) {
  const { selectedClientId } = useOrgClient();
  const query = useSales(selectedClientId, filters);
  const [sortKey, setSortKey] = useState<SortKey>('leadToEnrolmentRate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sales team</CardTitle>
      </CardHeader>
      <CardContent>
        <AsyncSection isLoading={query.isLoading} isError={query.isError} data={query.data} onRetry={() => query.refetch()} isEmpty={(d) => d.salesTeam.length === 0}>
          {(data) => {
            const sorted = [...data.salesTeam].sort((a, b) => {
              const av = a[sortKey];
              const bv = b[sortKey];
              const an = typeof av === 'string' ? av.toLowerCase() : (av ?? -1);
              const bn = typeof bv === 'string' ? bv.toLowerCase() : (bv ?? -1);
              if (an < bn) return sortDir === 'asc' ? -1 : 1;
              if (an > bn) return sortDir === 'asc' ? 1 : -1;
              return 0;
            });
            return (
              <Table>
                <TableHeader>
                  <TableRow>
                    {COLUMNS.map((col) => (
                      <TableHead key={col.key} className={cn(col.align === 'right' && 'text-right')} title={col.title}>
                        <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort(col.key)}>
                          {col.label}
                          {sortKey === col.key ? sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                        </button>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((row) => (
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
            );
          }}
        </AsyncSection>
      </CardContent>
    </Card>
  );
}
