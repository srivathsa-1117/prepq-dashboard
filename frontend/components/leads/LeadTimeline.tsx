'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AsyncSection } from '@/components/common/AsyncSection';
import { useLeadTimeline, useFilterOptions } from '@/lib/hooks/useDashboardData';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import { formatCurrencyCompact, formatDateTime } from '@/lib/utils/format';
import type { LeadStatus } from '@/lib/types/api';

const STATUS_LABEL: Record<LeadStatus, string> = {
  qualified: 'Qualified',
  not_qualified: 'Not qualified',
  not_reachable: 'Not reachable',
  junk: 'Junk',
  uncalled: 'No Activity / No Log',
};

const STATUS_VARIANT: Record<LeadStatus, 'good' | 'warning' | 'bad' | 'default'> = {
  qualified: 'good',
  not_qualified: 'warning',
  not_reachable: 'warning',
  junk: 'bad',
  uncalled: 'default',
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

export function LeadTimeline({ leadId }: { leadId: string }) {
  const { selectedClientId } = useOrgClient();
  const query = useLeadTimeline(selectedClientId, leadId);
  const coursesQuery = useFilterOptions(selectedClientId);

  const courseName = (courseId: string | null) => (courseId ? (coursesQuery.data?.courses.find((c) => c.id === courseId)?.name ?? courseId) : '—');

  return (
    <AsyncSection isLoading={query.isLoading} isError={query.isError} data={query.data} onRetry={() => query.refetch()}>
      {(data) => (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle>{data.lead.name ?? '(no name)'}</CardTitle>
              <Badge variant={STATUS_VARIANT[data.lead.status]}>{STATUS_LABEL[data.lead.status]}</Badge>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                <div>
                  <InfoRow label="Email" value={data.lead.email ?? '—'} />
                  <InfoRow label="Phone" value={data.lead.phone ?? '—'} />
                  <InfoRow label="Source" value={data.lead.source ?? '—'} />
                  <InfoRow label="Course" value={courseName(data.lead.courseId)} />
                  <InfoRow label="Owner" value={data.lead.owner ?? '—'} />
                </div>
                <div>
                  <InfoRow label="Created" value={formatDateTime(data.lead.createdAt)} />
                  <InfoRow label="First call" value={data.lead.firstCallAt ? formatDateTime(data.lead.firstCallAt) : '—'} />
                  <InfoRow label="Call attempts" value={String(data.lead.callAttempts)} />
                  <InfoRow label="Connected" value={data.lead.connected ? 'Yes' : 'No'} />
                  {data.lead.demoBookedAt && <InfoRow label="Demo booked" value={formatDateTime(data.lead.demoBookedAt)} />}
                  {data.lead.demoAttendedAt && <InfoRow label="Demo attended" value={formatDateTime(data.lead.demoAttendedAt)} />}
                  {data.lead.enrolledAt && <InfoRow label="Enrolled" value={formatDateTime(data.lead.enrolledAt)} />}
                  {data.lead.feePaid !== null && <InfoRow label="Fee paid" value={formatCurrencyCompact(data.lead.feePaid)} />}
                  {data.lead.dqReason && <InfoRow label="DQ reason" value={data.lead.dqReason} />}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {data.activities.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity logged for this lead yet.</p>
              ) : (
                <ol className="flex flex-col gap-4">
                  {data.activities.map((activity) => (
                    <li key={activity.id} className="flex gap-3 border-l-2 border-border pl-4">
                      <div className="flex flex-1 flex-col gap-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-foreground">{activity.activityType}</span>
                          <span className="text-xs tabular-nums text-muted-foreground">{formatDateTime(activity.activityAt)}</span>
                        </div>
                        {activity.outcome && <span className="text-xs text-muted-foreground">Outcome: {activity.outcome}</span>}
                        {activity.notes && <span className="text-xs text-muted-foreground">{activity.notes}</span>}
                        {activity.owner && <span className="text-xs text-muted-foreground">By {activity.owner}</span>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </AsyncSection>
  );
}
