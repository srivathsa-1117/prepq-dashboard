'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDateLabel, formatNumber } from '@/lib/utils/format';
import { chartColor } from '@/lib/utils/colors';
import type { CreativeDetailResponse } from '@/lib/types/api';

/** Trend chart for the creative detail drawer (spec §8: 14/30-day trend) - reuses whatever range the dashboard filter is set to. */
export function CreativePerformanceChart({ trend }: { trend: CreativeDetailResponse['trend'] }) {
  if (trend.length === 0) return <p className="text-xs text-muted-foreground">No data for this period.</p>;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={trend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="creativeLeadsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={chartColor.primary} stopOpacity={0.25} />
            <stop offset="100%" stopColor={chartColor.primary} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="creativeQualifiedFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={chartColor.good} stopOpacity={0.2} />
            <stop offset="100%" stopColor={chartColor.good} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={chartColor.grid} vertical={false} />
        <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 10, fill: chartColor.muted }} axisLine={{ stroke: chartColor.grid }} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: chartColor.muted }} axisLine={false} tickLine={false} width={32} />
        <Tooltip
          labelFormatter={(l) => formatDateLabel(String(l))}
          formatter={(value: number, name: string) => [formatNumber(value), name]}
        />
        <Area type="monotone" dataKey="leads" name="Leads" stroke={chartColor.primary} fill="url(#creativeLeadsFill)" strokeWidth={2} />
        <Area type="monotone" dataKey="qualified" name="Qualified" stroke={chartColor.good} fill="url(#creativeQualifiedFill)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
