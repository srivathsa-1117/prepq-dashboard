'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AsyncSection } from '@/components/common/AsyncSection';
import { useCampaignPerformance } from '@/lib/hooks/useDashboardData';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import type { DashboardFilterState } from '@/lib/hooks/useDashboardFilters';
import type { CampaignRow } from '@/lib/types/api';
import { formatCurrencyCompact, formatMultiplier, formatNumber, formatPercent } from '@/lib/utils/format';
import { platformColor } from '@/lib/utils/colors';
import { cn } from '@/lib/utils/cn';

type SortKey = keyof Pick<
  CampaignRow,
  'campaignName' | 'impressions' | 'clicks' | 'ctr' | 'spend' | 'leads' | 'qualified' | 'qualifiedRate' | 'enrolled' | 'revenue' | 'cpl' | 'roas'
>;

const COLUMNS: Array<{ key: SortKey; label: string; align?: 'right' }> = [
  { key: 'campaignName', label: 'Campaign' },
  { key: 'impressions', label: 'Impressions', align: 'right' },
  { key: 'clicks', label: 'Clicks', align: 'right' },
  { key: 'ctr', label: 'CTR', align: 'right' },
  { key: 'spend', label: 'Spend', align: 'right' },
  { key: 'leads', label: 'Leads', align: 'right' },
  { key: 'qualified', label: 'Qualified', align: 'right' },
  { key: 'qualifiedRate', label: 'Qual. rate', align: 'right' },
  { key: 'enrolled', label: 'Enrolled', align: 'right' },
  { key: 'revenue', label: 'Revenue', align: 'right' },
  { key: 'cpl', label: 'CPL', align: 'right' },
  { key: 'roas', label: 'ROAS', align: 'right' },
];

const PAGE_SIZE = 20;

export function CampaignTable({
  filters,
  onSelectCampaign,
}: {
  filters: DashboardFilterState;
  onSelectCampaign: (campaign: CampaignRow) => void;
}) {
  const { selectedClientId } = useOrgClient();
  const query = useCampaignPerformance(selectedClientId, filters);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('spend');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(0);
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <AsyncSection isLoading={query.isLoading} isError={query.isError} data={query.data} onRetry={() => query.refetch()} isEmpty={(d) => d.campaigns.length === 0}>
          {(data) => {
            // Statuses come straight from Meta/Google (ACTIVE/PAUSED/REMOVED, ENABLED/PAUSED/REMOVED, …) -
            // populated from whatever the currently-loaded campaigns actually have, never a hardcoded list,
            // since the vocabulary differs per platform and is outside our control.
            const availableStatuses = Array.from(new Set(data.campaigns.map((c) => c.status).filter((s): s is string => !!s))).sort();
            const filtered = data.campaigns.filter(
              (c) => (c.campaignName ?? '').toLowerCase().includes(search.toLowerCase()) && (statusFilter === 'all' || c.status === statusFilter),
            );
            const sorted = [...filtered].sort((a, b) => {
              const av = a[sortKey];
              const bv = b[sortKey];
              const an = typeof av === 'string' ? av.toLowerCase() : av ?? 0;
              const bn = typeof bv === 'string' ? bv.toLowerCase() : bv ?? 0;
              if (an < bn) return sortDir === 'asc' ? -1 : 1;
              if (an > bn) return sortDir === 'asc' ? 1 : -1;
              return 0;
            });
            const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
            const pageRows = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

            return (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-64">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(0);
                      }}
                      placeholder="Search campaigns…"
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                  <Select
                    value={statusFilter}
                    onValueChange={(v) => {
                      setStatusFilter(v);
                      setPage(0);
                    }}
                  >
                    <SelectTrigger className="h-8 w-40 text-xs">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      {availableStatuses.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {sorted.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No campaigns match these filters.</p>
                ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Platform</TableHead>
                      {COLUMNS.map((col) => (
                        <TableHead key={col.key} className={cn(col.align === 'right' && 'text-right')}>
                          <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort(col.key)}>
                            {col.label}
                            {sortKey === col.key ? sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                          </button>
                        </TableHead>
                      ))}
                      <TableHead>Status</TableHead>
                      <TableHead>Course</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((c) => (
                      <TableRow key={`${c.provider}-${c.campaignId}`} className="cursor-pointer" onClick={() => onSelectCampaign(c)}>
                        <TableCell>
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: platformColor(c.provider) }}
                            title={c.provider}
                          />
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate font-medium text-foreground" title={c.campaignName ?? undefined}>
                          {c.campaignName ?? c.campaignId}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(c.impressions)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(c.clicks)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPercent(c.ctr, 2)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrencyCompact(c.spend)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(c.leads)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(c.qualified)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPercent(c.qualifiedRate)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(c.enrolled)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrencyCompact(c.revenue)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrencyCompact(c.cpl)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMultiplier(c.roas)}</TableCell>
                        <TableCell>{c.status && <Badge variant="outline">{c.status}</Badge>}</TableCell>
                        <TableCell className="text-muted-foreground">{c.courseCode ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                )}

                {sorted.length > 0 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {page * PAGE_SIZE + 1}–{Math.min(sorted.length, (page + 1) * PAGE_SIZE)} of {sorted.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                      Previous
                    </Button>
                    <span>
                      Page {page + 1} of {totalPages}
                    </span>
                    <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
                )}
              </div>
            );
          }}
        </AsyncSection>
      </CardContent>
    </Card>
  );
}
