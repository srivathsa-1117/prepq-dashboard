'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FatigueBadge } from '@/components/common/FatigueBadge';
import { AssetPreview } from './AssetPreview';
import type { CreativeRow } from '@/lib/types/api';
import { formatCurrencyCompact, formatNumber, formatPercent } from '@/lib/utils/format';
import { creativeStatusLabel, creativeStatusVariant } from '@/lib/utils/creativeStatus';
import { platformColor } from '@/lib/utils/colors';

/** Visual, asset-driven card - the primary UI for the creative grid, not a text table row (spec §8). */
export function CreativeCard({ creative, onClick }: { creative: CreativeRow; onClick: () => void }) {
  return (
    <Card className="group cursor-pointer overflow-hidden transition-shadow hover:shadow-md" onClick={onClick}>
      <div className="relative">
        <AssetPreview url={creative.creativePreviewUrl} alt={creative.creativeName} className="aspect-[4/3] w-full" />
        <div className="absolute left-2 top-2 flex items-center gap-1.5">
          <Badge variant={creativeStatusVariant(creative.status)}>{creativeStatusLabel(creative.status)}</Badge>
          {creative.provider && (
            <span className="flex h-5 items-center rounded-full bg-black/50 px-1.5 text-[10px] font-medium text-white backdrop-blur-sm">
              <span className="mr-1 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: platformColor(creative.provider) }} />
              {creative.provider}
            </span>
          )}
        </div>
        {creative.fatigue && (
          <div className="absolute right-2 top-2">
            <FatigueBadge fatigue={creative.fatigue} />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 p-3">
        <p className="truncate text-sm font-medium text-foreground" title={creative.creativeName}>
          {creative.creativeName}
        </p>
        <p className="truncate text-xs text-muted-foreground">{creative.campaignName ?? 'Not yet mapped to a campaign'}</p>
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          <Metric label="Leads" value={formatNumber(creative.leads)} />
          <Metric label="CPL" value={formatCurrencyCompact(creative.cpl)} />
          <Metric label="Qualified" value={`${formatNumber(creative.qualified)} · ${formatPercent(creative.qualifiedRate)}`} />
          <Metric label="Enrolled" value={formatNumber(creative.enrolled)} />
          <Metric label="No Response" value={formatNumber(creative.notReachable)} />
        </div>
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm bg-chip px-1.5 py-1">
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="tabular-nums font-medium text-foreground">{value}</p>
    </div>
  );
}
