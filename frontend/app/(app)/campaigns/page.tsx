'use client';

import { Suspense, useState } from 'react';
import { useDashboardFilters } from '@/lib/hooks/useDashboardFilters';
import { DateFilter } from '@/components/filters/DateFilter';
import { CourseFilter } from '@/components/filters/CourseFilter';
import { PlatformFilter } from '@/components/filters/PlatformFilter';
import { CampaignKpis } from '@/components/campaigns/CampaignKpis';
import { CampaignTable } from '@/components/campaigns/CampaignTable';
import { CampaignDetailDrawer } from '@/components/campaigns/CampaignDetailDrawer';
import type { CampaignRow } from '@/lib/types/api';

export default function CampaignsPage() {
  return (
    <Suspense>
      <CampaignsContent />
    </Suspense>
  );
}

function CampaignsContent() {
  const { filters, setFilters } = useDashboardFilters();
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignRow | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-foreground">Campaigns</h1>
        <div className="flex flex-wrap items-center gap-2">
          <PlatformFilter value={filters.source} onChange={(source) => setFilters({ source })} />
          <CourseFilter value={filters.course} onChange={(course) => setFilters({ course })} />
          <DateFilter filters={filters} setFilters={setFilters} />
        </div>
      </div>

      <CampaignKpis filters={filters} />
      <CampaignTable filters={filters} onSelectCampaign={setSelectedCampaign} />
      <CampaignDetailDrawer campaign={selectedCampaign} filters={filters} onClose={() => setSelectedCampaign(null)} />
    </div>
  );
}
