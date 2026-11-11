'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AsyncSection } from '@/components/common/AsyncSection';
import { FatigueBadge } from '@/components/common/FatigueBadge';
import { useCampaignDetail } from '@/lib/hooks/useDashboardData';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import type { DashboardFilterState } from '@/lib/hooks/useDashboardFilters';
import type { CampaignRow } from '@/lib/types/api';
import { formatCurrencyCompact, formatDateLabel, formatMultiplier, formatNumber, formatPercent } from '@/lib/utils/format';
import { chartColor, platformColor } from '@/lib/utils/colors';

/** Campaign drilldown as a side panel, not a fourth page (spec §7/§17). */
export function CampaignDetailDrawer({
  campaign,
  filters,
  onClose,
}: {
  campaign: CampaignRow | null;
  filters: DashboardFilterState;
  onClose: () => void;
}) {
  const { selectedClientId } = useOrgClient();
  const query = useCampaignDetail(selectedClientId, campaign?.campaignId ?? null, filters);

  return (
    <Sheet open={!!campaign} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: platformColor(campaign?.provider) }} />
            {campaign?.campaignName ?? campaign?.campaignId}
          </SheetTitle>
          <SheetDescription>Campaign performance, ad sets, and top/worst ads.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <AsyncSection isLoading={query.isLoading} isError={query.isError} data={query.data} onRetry={() => query.refetch()}>
            {(data) => (
              <div className="flex flex-col gap-6">
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  <Stat label="Spend" value={formatCurrencyCompact(data.campaign.spend)} />
                  <Stat label="Leads" value={formatNumber(data.campaign.leads)} />
                  <Stat label="Qualified" value={formatNumber(data.campaign.qualified)} />
                  <Stat label="Qual. rate" value={formatPercent(data.campaign.qualifiedRate)} />
                  <Stat label="No Response" value={formatNumber(data.campaign.notReachable)} />
                  <Stat label="Enrolled" value={formatNumber(data.campaign.enrolled)} />
                  <Stat label="Revenue" value={formatCurrencyCompact(data.campaign.revenue)} />
                  <Stat label="CPL" value={formatCurrencyCompact(data.campaign.cpl)} />
                  <Stat label="ROAS" value={formatMultiplier(data.campaign.roas)} />
                  <Stat label="CTR" value={formatPercent(data.campaign.ctr, 2)} />
                </div>

                <section>
                  <h3 className="mb-2 text-sm font-semibold text-foreground">Trend</h3>
                  {data.trend.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No data for this period.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={180}>
                      <AreaChart data={data.trend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="campaignLeadsFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={chartColor.primary} stopOpacity={0.25} />
                            <stop offset="100%" stopColor={chartColor.primary} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke={chartColor.grid} vertical={false} />
                        <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 10, fill: chartColor.muted }} axisLine={{ stroke: chartColor.grid }} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: chartColor.muted }} axisLine={false} tickLine={false} width={32} />
                        <Tooltip labelFormatter={(l) => formatDateLabel(String(l))} />
                        <Area type="monotone" dataKey="leads" name="Leads" stroke={chartColor.primary} fill="url(#campaignLeadsFill)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </section>

                <section>
                  <h3 className="mb-2 text-sm font-semibold text-foreground">Ad sets / ad groups</h3>
                  {data.adGroups.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No data for this period.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead className="text-right">Spend</TableHead>
                          <TableHead className="text-right">Leads</TableHead>
                          <TableHead className="text-right">Qualified</TableHead>
                          <TableHead className="text-right">Qual. rate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.adGroups.map((g) => (
                          <TableRow key={g.adsetId}>
                            <TableCell className="max-w-[180px] truncate font-medium text-foreground">{g.adsetName ?? g.adsetId}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCurrencyCompact(g.spend)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatNumber(g.leads)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatNumber(g.qualified)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatPercent(g.qualifiedRate)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </section>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <section>
                    <h3 className="mb-2 text-sm font-semibold text-foreground">Top ads</h3>
                    <AdList ads={data.topAds} />
                  </section>
                  <section>
                    <h3 className="mb-2 text-sm font-semibold text-foreground">Worst ads</h3>
                    <AdList ads={data.worstAds} />
                  </section>
                </div>

                <section>
                  <h3 className="mb-2 text-sm font-semibold text-foreground">Creatives</h3>
                  {data.creatives.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No data for this period.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {data.creatives.map((c) => (
                        <div key={c.creativeId} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                          <span className="truncate text-xs font-medium text-foreground">{c.creativeName}</span>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{formatNumber(c.leads)} leads</span>
                            <span>{formatNumber(c.qualified)} qual. ({formatPercent(c.qualifiedRate)})</span>
                            <FatigueBadge fatigue={c.fatigue} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}
          </AsyncSection>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-chip px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function AdList({
  ads,
}: {
  ads: Array<{ adId: string; adName: string | null; spend: number; leads: number; qualified: number; qualifiedRate: number; enrolled: number }>;
}) {
  if (ads.length === 0) return <p className="text-xs text-muted-foreground">No data for this period.</p>;
  return (
    <div className="flex flex-col gap-2">
      {ads.map((ad) => (
        <div key={ad.adId} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
          <span className="truncate text-xs font-medium text-foreground">{ad.adName ?? ad.adId}</span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatNumber(ad.leads)} leads</span>
            <span>{formatNumber(ad.qualified)} qual.</span>
            <span>{formatNumber(ad.enrolled)} enrolled</span>
            <Badge variant="outline">{formatPercent(ad.qualifiedRate)}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
