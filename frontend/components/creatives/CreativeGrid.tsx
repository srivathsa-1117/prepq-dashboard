'use client';

import { useState } from 'react';
import { AsyncSection } from '@/components/common/AsyncSection';
import { EmptyState } from '@/components/common/EmptyState';
import { FatigueBadge } from '@/components/common/FatigueBadge';
import { AssetPreview } from './AssetPreview';
import { CreativeCard } from './CreativeCard';
import { CreativeFilters, type CreativeGridControls } from './CreativeFilters';
import { Badge } from '@/components/ui/badge';
import { useCreativePerformance } from '@/lib/hooks/useDashboardData';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import type { DashboardFilterState } from '@/lib/hooks/useDashboardFilters';
import type { CreativeRow } from '@/lib/types/api';
import { creativeStatusLabel, creativeStatusVariant } from '@/lib/utils/creativeStatus';
import { formatCurrencyCompact, formatNumber, formatPercent } from '@/lib/utils/format';

export function CreativeGrid({ filters, onSelect }: { filters: DashboardFilterState; onSelect: (creative: CreativeRow) => void }) {
  const { selectedClientId } = useOrgClient();
  const query = useCreativePerformance(selectedClientId, filters);
  const [controls, setControls] = useState<CreativeGridControls>({ search: '', status: 'all', sort: 'spend', view: 'grid' });

  return (
    <div className="flex flex-col gap-4">
      <CreativeFilters controls={controls} onChange={(patch) => setControls((c) => ({ ...c, ...patch }))} />

      <AsyncSection
        isLoading={query.isLoading}
        isError={query.isError}
        data={query.data}
        onRetry={() => query.refetch()}
        isEmpty={(d) => d.creatives.length === 0}
        skeleton={
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="aspect-[4/5] animate-pulse rounded-lg bg-chip" />
            ))}
          </div>
        }
      >
        {(data) => {
          let rows = data.creatives;
          if (controls.status !== 'all') rows = rows.filter((c) => c.status === controls.status);
          if (controls.search) rows = rows.filter((c) => c.creativeName.toLowerCase().includes(controls.search.toLowerCase()));

          rows = [...rows].sort((a, b) => {
            if (controls.sort === 'recent') return 0;
            const av = (a as any)[controls.sort] ?? 0;
            const bv = (b as any)[controls.sort] ?? 0;
            return bv - av;
          });

          if (rows.length === 0) return <EmptyState message="No creatives match these filters." />;

          if (controls.view === 'list') {
            return (
              <div className="flex flex-col gap-2">
                {rows.map((c) => (
                  <button
                    key={c.creativeId}
                    onClick={() => onSelect(c)}
                    className="flex items-center gap-3 rounded-md border border-border bg-card p-2 text-left hover:bg-chip/40"
                  >
                    <AssetPreview url={c.creativePreviewUrl} alt={c.creativeName} className="h-14 w-14 shrink-0 rounded-md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{c.creativeName}</p>
                      <p className="truncate text-xs text-muted-foreground">{c.campaignName ?? 'Not yet mapped'}</p>
                    </div>
                    <Badge variant={creativeStatusVariant(c.status)}>{creativeStatusLabel(c.status)}</Badge>
                    <span className="w-16 shrink-0 text-right text-xs tabular-nums text-foreground">{formatNumber(c.leads)} leads</span>
                    <span className="w-24 shrink-0 text-right text-xs tabular-nums text-foreground">
                      {formatNumber(c.qualified)} qual. ({formatPercent(c.qualifiedRate)})
                    </span>
                    <span className="w-20 shrink-0 text-right text-xs tabular-nums text-foreground">{formatNumber(c.enrolled)} enrolled</span>
                    <span className="w-20 shrink-0 text-right text-xs tabular-nums text-foreground">{formatCurrencyCompact(c.spend)}</span>
                    <FatigueBadge fatigue={c.fatigue} />
                  </button>
                ))}
              </div>
            );
          }

          return (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {rows.map((c) => (
                <CreativeCard key={c.creativeId} creative={c} onClick={() => onSelect(c)} />
              ))}
            </div>
          );
        }}
      </AsyncSection>
    </div>
  );
}
