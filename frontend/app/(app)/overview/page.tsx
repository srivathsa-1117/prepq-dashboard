'use client';

import { Suspense } from 'react';
import { useDashboardFilters } from '@/lib/hooks/useDashboardFilters';
import { useOverview } from '@/lib/hooks/useDashboardData';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import { DateFilter } from '@/components/filters/DateFilter';
import { CourseFilter } from '@/components/filters/CourseFilter';
import { SourceFilter } from '@/components/filters/SourceFilter';
import { AsyncSection } from '@/components/common/AsyncSection';
import { MetricCard } from '@/components/overview/MetricCard';
import { Funnel } from '@/components/overview/Funnel';
import { TrendChart } from '@/components/overview/TrendChart';
import { TargetsEditor } from '@/components/overview/TargetsEditor';
import { EnrolledLeadsRevenue } from '@/components/overview/EnrolledLeadsRevenue';
import { AgingBuckets } from '@/components/overview/AgingBuckets';
import { SpeedToLead } from '@/components/overview/SpeedToLead';
import { FollowupDepth } from '@/components/overview/FollowupDepth';
import { LeadQuality } from '@/components/overview/LeadQuality';
import { DisqualificationReasons } from '@/components/overview/DisqualificationReasons';
import { SourcePerformance } from '@/components/overview/SourcePerformance';
import { CohortTable } from '@/components/overview/CohortTable';
import { SalesTeamTable } from '@/components/overview/SalesTeamTable';
import { RevenueSummary } from '@/components/overview/RevenueSummary';
import { formatCurrencyCompact, formatMultiplier, formatNumber, formatPercent } from '@/lib/utils/format';

function KpiRow() {
  const { selectedClientId } = useOrgClient();
  const { filters } = useDashboardFilters();
  const query = useOverview(selectedClientId, filters);

  return (
    <AsyncSection
      isLoading={query.isLoading}
      isError={query.isError}
      data={query.data}
      onRetry={() => query.refetch()}
      skeleton={
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-chip" />
          ))}
        </div>
      }
    >
      {(data) => (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <MetricCard label="Leads" value={formatNumber(data.leads)} deltaPct={data.periodOverPeriod.deltaPct} />
          <MetricCard label="Qualified rate" value={formatPercent(data.qualifiedRate)} />
          <MetricCard label="Enrolled" value={formatNumber(data.enrolled)} />
          <MetricCard label="Spend" value={formatCurrencyCompact(data.spend)} />
          <MetricCard label="Revenue" value={formatCurrencyCompact(data.revenue)} />
          <MetricCard label="ROAS" value={formatMultiplier(data.roas)} />
          <MetricCard label="Cost / lead" value={formatCurrencyCompact(data.cpl)} />
          <MetricCard label="Cost / qualified" value={formatCurrencyCompact(data.costPerQualified)} />
          <MetricCard label="Cost / enrollment" value={formatCurrencyCompact(data.costPerEnrollment)} />
          <MetricCard label="Impressions" value={formatNumber(data.impressions)} />
          <MetricCard label="Clicks" value={formatNumber(data.clicks)} />
          <MetricCard label="Junk rate" value={formatPercent(data.junkRate)} />
        </div>
      )}
    </AsyncSection>
  );
}

export default function OverviewPage() {
  return (
    <Suspense>
      <OverviewContent />
    </Suspense>
  );
}

function OverviewContent() {
  const { filters, setFilters } = useDashboardFilters();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-foreground">Overview</h1>
        <div className="flex flex-wrap items-center gap-2">
          <CourseFilter value={filters.course} onChange={(course) => setFilters({ course })} />
          <SourceFilter value={filters.source} onChange={(source) => setFilters({ source })} />
          <DateFilter filters={filters} setFilters={setFilters} />
        </div>
      </div>

      <KpiRow />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TrendChart filters={filters} />
        </div>
        <TargetsEditor filters={filters} />
      </div>

      <Funnel filters={filters} />

      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Sales operations</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AgingBuckets filters={filters} />
          <SpeedToLead filters={filters} />
          <FollowupDepth filters={filters} />
          <LeadQuality filters={filters} />
        </div>
        <div className="mt-4">
          <SalesTeamTable filters={filters} />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Marketing signals</h2>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <DisqualificationReasons filters={filters} />
          <SourcePerformance filters={filters} />
          <div className="xl:col-span-2">
            <CohortTable filters={filters} />
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Revenue</h2>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <RevenueSummary filters={filters} />
          <EnrolledLeadsRevenue />
        </div>
      </div>
    </div>
  );
}
