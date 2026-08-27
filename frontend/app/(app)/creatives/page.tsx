'use client';

import { Suspense, useState } from 'react';
import { useDashboardFilters } from '@/lib/hooks/useDashboardFilters';
import { DateFilter } from '@/components/filters/DateFilter';
import { CourseFilter } from '@/components/filters/CourseFilter';
import { PlatformFilter } from '@/components/filters/PlatformFilter';
import { CreativeHeroKpis } from '@/components/creatives/CreativeHeroKpis';
import { CreativeGrid } from '@/components/creatives/CreativeGrid';
import { CreativeDetailDrawer } from '@/components/creatives/CreativeDetailDrawer';
import type { CreativeRow } from '@/lib/types/api';

export default function CreativesPage() {
  return (
    <Suspense>
      <CreativesContent />
    </Suspense>
  );
}

function CreativesContent() {
  const { filters, setFilters } = useDashboardFilters();
  const [selectedCreative, setSelectedCreative] = useState<CreativeRow | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-foreground">Creatives</h1>
        <div className="flex flex-wrap items-center gap-2">
          <PlatformFilter value={filters.source} onChange={(source) => setFilters({ source })} />
          <CourseFilter value={filters.course} onChange={(course) => setFilters({ course })} />
          <DateFilter filters={filters} setFilters={setFilters} />
        </div>
      </div>

      <CreativeHeroKpis filters={filters} />
      <CreativeGrid filters={filters} onSelect={setSelectedCreative} />
      <CreativeDetailDrawer creative={selectedCreative} filters={filters} onClose={() => setSelectedCreative(null)} />
    </div>
  );
}
