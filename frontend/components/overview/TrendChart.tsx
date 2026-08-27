'use client';

import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AsyncSection } from '@/components/common/AsyncSection';
import { useTrends } from '@/lib/hooks/useDashboardData';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import type { DashboardFilterState } from '@/lib/hooks/useDashboardFilters';
import { formatDateLabel, formatNumber, formatCurrencyCompact } from '@/lib/utils/format';
import { chartColor } from '@/lib/utils/colors';

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{formatDateLabel(label)}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-muted-foreground">
          {p.name}: <span className="font-medium text-foreground">{p.dataKey === 'spend' ? formatCurrencyCompact(p.value) : formatNumber(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

/** Leads/qualified/enrolled + spend trend over the selected range (spec §6). */
export function TrendChart({ filters }: { filters: DashboardFilterState }) {
  const { selectedClientId } = useOrgClient();
  const query = useTrends(selectedClientId, filters);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <AsyncSection
          isLoading={query.isLoading}
          isError={query.isError}
          data={query.data}
          onRetry={() => query.refetch()}
          isEmpty={(d) => d.series.every((s) => s.leads === 0 && s.spend === 0)}
          skeleton={<div className="h-64 w-full animate-pulse rounded-md bg-chip" />}
        >
          {(data) => (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={data.series} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="leadsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColor.primary} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={chartColor.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={chartColor.grid} vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 11, fill: chartColor.muted }} axisLine={{ stroke: chartColor.grid }} tickLine={false} />
                <YAxis yAxisId="count" allowDecimals={false} tick={{ fontSize: 11, fill: chartColor.muted }} axisLine={false} tickLine={false} width={40} />
                <YAxis
                  yAxisId="spend"
                  orientation="right"
                  tickFormatter={formatCurrencyCompact}
                  tick={{ fontSize: 11, fill: chartColor.muted }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar yAxisId="spend" dataKey="spend" name="Spend" fill={chartColor.warning} fillOpacity={0.35} radius={[2, 2, 0, 0]} />
                <Area yAxisId="count" type="monotone" dataKey="leads" name="Leads" stroke={chartColor.primary} fill="url(#leadsFill)" strokeWidth={2} />
                <Line yAxisId="count" type="monotone" dataKey="qualified" name="Qualified" stroke={chartColor.good} strokeWidth={2} dot={false} />
                <Line yAxisId="count" type="monotone" dataKey="enrolled" name="Enrolled" stroke={chartColor.ea} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </AsyncSection>
      </CardContent>
    </Card>
  );
}
