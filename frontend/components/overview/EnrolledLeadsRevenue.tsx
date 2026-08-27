'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AsyncSection } from '@/components/common/AsyncSection';
import { useEnrolledLeads, useFilterOptions, useSetLeadRevenue } from '@/lib/hooks/useDashboardData';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import { formatCurrencyCompact, formatDateLabel } from '@/lib/utils/format';

const EDITOR_ROLES = new Set(['manager', 'admin', 'owner']);

function RevenueCell({ leadId, feePaid, editable }: { leadId: string; feePaid: number | null; editable: boolean }) {
  const { selectedClientId } = useOrgClient();
  const mutation = useSetLeadRevenue(selectedClientId);
  const [value, setValue] = useState(feePaid !== null ? String(feePaid) : '');
  const [editing, setEditing] = useState(false);

  if (!editable) return <span className="tabular-nums">{feePaid !== null ? formatCurrencyCompact(feePaid) : '—'}</span>;

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="tabular-nums text-foreground underline-offset-2 hover:underline"
        title="Click to edit"
      >
        {feePaid !== null ? formatCurrencyCompact(feePaid) : 'Add revenue'}
      </button>
    );
  }

  return (
    <form
      className="flex items-center justify-end gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        const amount = Math.max(0, Number(value) || 0);
        mutation.mutate({ leadId, feePaid: amount }, { onSuccess: () => setEditing(false) });
      }}
    >
      <Input
        autoFocus
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-7 w-28 text-right"
        onKeyDown={(e) => {
          if (e.key === 'Escape') setEditing(false);
        }}
      />
      <Button type="submit" size="sm" className="h-7 px-2" disabled={mutation.isPending}>
        Save
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditing(false)}>
        Cancel
      </Button>
    </form>
  );
}

/**
 * This account doesn't use Meritto's Payments API (never wired up - see backend/merittoSync.ts),
 * so fee_paid never populates automatically. Enrollment itself comes from Meritto's own
 * lead_stage="Enrolled" disposition (real signal); revenue for those leads is entered here
 * manually since there's nowhere else it could come from for this account.
 */
export function EnrolledLeadsRevenue() {
  const { selectedClientId, selectedRole } = useOrgClient();
  const query = useEnrolledLeads(selectedClientId);
  const coursesQuery = useFilterOptions(selectedClientId);
  const canEdit = !!selectedRole && EDITOR_ROLES.has(selectedRole);

  const courseName = (id: string | null) => (id ? (coursesQuery.data?.courses.find((c) => c.id === id)?.name ?? id) : '—');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enrolled leads — revenue</CardTitle>
      </CardHeader>
      <CardContent>
        <AsyncSection
          isLoading={query.isLoading}
          isError={query.isError}
          data={query.data}
          onRetry={() => query.refetch()}
          isEmpty={(d) => d.leads.length === 0}
          emptyMessage="No enrolled leads yet."
        >
          {(data) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Enrolled</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium text-foreground">{lead.name ?? '(no name)'}</TableCell>
                    <TableCell className="text-muted-foreground">{courseName(lead.courseId)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDateLabel(lead.enrolledAt)}</TableCell>
                    <TableCell className="text-right">
                      <RevenueCell leadId={lead.id} feePaid={lead.feePaid} editable={canEdit} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </AsyncSection>
      </CardContent>
    </Card>
  );
}
