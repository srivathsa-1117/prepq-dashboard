'use client';

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AsyncSection } from '@/components/common/AsyncSection';
import { useSourcePerformance } from '@/lib/hooks/useDashboardData';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import type { DashboardFilterState } from '@/lib/hooks/useDashboardFilters';
import { formatCurrencyCompact, formatMultiplier, formatNumber, formatPercent } from '@/lib/utils/format';
import { chartColor, platformColor } from '@/lib/utils/colors';

function sourceBarColor(source: string): string {
  const lower = source.toLowerCase();
  if (lower === 'meta' || lower === 'google') return platformColor(lower);
  return chartColor.baseline;
}

function SpendByTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium capitalize text-foreground">{row.source}</p>
      <p className="text-muted-foreground">
        Spend: <span className="font-medium text-foreground">{formatCurrencyCompact(row.spend)}</span>
      </p>
      <p className="text-muted-foreground">
        Leads: <span className="font-medium text-foreground">{formatNumber(row.leads)}</span>
      </p>
    </div>
  );
}

export function SourcePerformance({ filters }: { filters: DashboardFilterState }) {
  const { selectedClientId } = useOrgClient();
  const query = useSourcePerformance(selectedClientId, filters);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Source performance</CardTitle>
      </CardHeader>
      <CardContent>
        <AsyncSection isLoading={query.isLoading} isError={query.isError} data={query.data} onRetry={() => query.refetch()} isEmpty={(d) => d.sources.length === 0}>
          {(data) => (
            <>
              {data.sources.some((s) => s.spend > 0) && (
                <ResponsiveContainer width="100%" height={Math.max(120, data.sources.length * 32)} className="mb-4">
                  <BarChart
                    data={[...data.sources].sort((a, b) => b.spend - a.spend)}
                    layout="vertical"
                    margin={{ top: 0, right: 24, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid stroke={chartColor.grid} horizontal={false} />
                    <XAxis type="number" tickFormatter={formatCurrencyCompact} tick={{ fontSize: 11, fill: chartColor.muted }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="source"
                      width={150}
                      tick={{ fontSize: 11, fill: chartColor.muted }}
                      axisLine={false}
                      tickLine={false}
                      className="capitalize"
                    />
                    <Tooltip content={<SpendByTooltip />} cursor={{ fill: chartColor.chip }} />
                    <Bar dataKey="spend" name="Spend" radius={[0, 3, 3, 0]}>
                      {data.sources.map((s) => (
                        <Cell key={s.source} fill={sourceBarColor(s.source)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Qualified</TableHead>
                  <TableHead className="text-right">Qualified rate</TableHead>
                  <TableHead className="text-right">Enrolled</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">CPL</TableHead>
                  <TableHead className="text-right">ROAS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.sources.map((s) => (
                  <TableRow key={s.source}>
                    <TableCell className="font-medium capitalize text-foreground">{s.source}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(s.leads)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(s.qualified)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPercent(s.qualifiedRate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(s.enrolled)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrencyCompact(s.spend)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrencyCompact(s.cpl)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMultiplier(s.roas)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              </Table>
            </>
          )}
        </AsyncSection>
      </CardContent>
    </Card>
  );
}
