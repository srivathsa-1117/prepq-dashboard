'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AsyncSection } from '@/components/common/AsyncSection';
import { FatigueBadge } from '@/components/common/FatigueBadge';
import { AssetPreview } from './AssetPreview';
import { CarouselPreview } from './CarouselPreview';
import { CreativePerformanceChart } from './CreativePerformanceChart';
import { useCreativeDetail } from '@/lib/hooks/useDashboardData';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import type { DashboardFilterState } from '@/lib/hooks/useDashboardFilters';
import type { CreativeRow } from '@/lib/types/api';
import { formatCurrencyCompact, formatDateLabel, formatMultiplier, formatNumber, formatPercent } from '@/lib/utils/format';
import { creativeStatusLabel, creativeStatusVariant } from '@/lib/utils/creativeStatus';
import { platformColor } from '@/lib/utils/colors';

export function CreativeDetailDrawer({
  creative,
  filters,
  onClose,
}: {
  creative: CreativeRow | null;
  filters: DashboardFilterState;
  onClose: () => void;
}) {
  const { selectedClientId } = useOrgClient();
  const query = useCreativeDetail(selectedClientId, creative?.creativeId ?? null, filters);

  return (
    <Sheet open={!!creative} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="truncate">{creative?.creativeName}</SheetTitle>
          <SheetDescription>Asset, performance trend, and fatigue breakdown.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <AsyncSection isLoading={query.isLoading} isError={query.isError} data={query.data} onRetry={() => query.refetch()}>
            {(data) => (
              <div className="flex flex-col gap-6">
                {data.creative.carouselImages && data.creative.carouselImages.length > 1 ? (
                  <CarouselPreview images={data.creative.carouselImages} alt={data.creative.name} className="aspect-video w-full rounded-md" />
                ) : (
                  <AssetPreview url={data.creative.assetUrl ?? data.creative.thumbnailUrl} alt={data.creative.name} className="aspect-video w-full rounded-md" playableVideo />
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={creativeStatusVariant(data.creative.status)}>{creativeStatusLabel(data.creative.status)}</Badge>
                  {data.creative.platform && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: platformColor(data.creative.platform) }} />
                      {data.creative.platform}
                    </span>
                  )}
                  {data.creative.courseCode && <Badge variant="outline">{data.creative.courseCode}</Badge>}
                  <FatigueBadge fatigue={data.fatigue} />
                </div>

                {(data.creative.concept || data.creative.hook || data.creative.angle || data.creative.format) && (
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {data.creative.concept && <Detail label="Concept" value={data.creative.concept} />}
                    {data.creative.hook && <Detail label="Hook" value={data.creative.hook} />}
                    {data.creative.angle && <Detail label="Angle" value={data.creative.angle} />}
                    {data.creative.format && <Detail label="Format" value={data.creative.format} />}
                  </div>
                )}

                <Separator />

                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  <Stat label="Spend" value={formatCurrencyCompact(data.performance.spend)} />
                  <Stat label="Leads" value={formatNumber(data.performance.leads)} />
                  <Stat label="Qualified" value={formatNumber(data.performance.qualified)} />
                  <Stat label="Qual. rate" value={formatPercent(data.performance.qualifiedRate)} />
                  <Stat label="Enrolled" value={formatNumber(data.performance.enrolled)} />
                  <Stat label="Revenue" value={formatCurrencyCompact(data.performance.revenue)} />
                  <Stat label="CPL" value={formatCurrencyCompact(data.performance.cpl)} />
                  <Stat label="ROAS" value={formatMultiplier(data.performance.roas)} />
                  <Stat label="Junk rate" value={formatPercent(data.performance.junkRate)} />
                </div>

                <section>
                  <h3 className="mb-2 text-sm font-semibold text-foreground">Performance trend</h3>
                  <CreativePerformanceChart trend={data.trend} />
                </section>

                <section>
                  <h3 className="mb-2 text-sm font-semibold text-foreground">Fatigue breakdown</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-md border border-border p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Current ({formatDateLabel(data.fatigue.currentWindow.from)} – {formatDateLabel(data.fatigue.currentWindow.to)})
                      </p>
                      <p className="text-lg font-semibold tabular-nums text-foreground">{formatPercent(data.fatigue.currentWindowRate)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatNumber(data.fatigue.currentWindow.qualified)} / {formatNumber(data.fatigue.currentWindow.leads)} qualified
                      </p>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Previous ({formatDateLabel(data.fatigue.previousWindow.from)} – {formatDateLabel(data.fatigue.previousWindow.to)})
                      </p>
                      <p className="text-lg font-semibold tabular-nums text-foreground">{formatPercent(data.fatigue.previousWindowRate)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatNumber(data.fatigue.previousWindow.qualified)} / {formatNumber(data.fatigue.previousWindow.leads)} qualified
                      </p>
                    </div>
                  </div>
                </section>

                {data.creative.mappings.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-sm font-semibold text-foreground">Live mappings</h3>
                    <div className="flex flex-col gap-2">
                      {data.creative.mappings.map((m, i) => (
                        <div key={i} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs">
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: platformColor(m.platform) }} />
                            {m.adName ?? m.adId ?? 'Unnamed ad'}
                          </span>
                          <span className="text-muted-foreground">
                            {m.campaignName} {m.adsetOrAdgroupName ? `· ${m.adsetOrAdgroupName}` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-foreground">{value}</p>
    </div>
  );
}
