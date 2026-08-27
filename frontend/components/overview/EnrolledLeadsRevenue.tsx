'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { AsyncSection } from '@/components/common/AsyncSection';
import { useEnrolledLeads, useFilterOptions, useSetLeadRevenue, useSetLeadCourse } from '@/lib/hooks/useDashboardData';
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

function CourseCell({
  leadId,
  courseId,
  courses,
  editable,
}: {
  leadId: string;
  courseId: string | null;
  courses: Array<{ id: string; name: string }>;
  editable: boolean;
}) {
  const { selectedClientId } = useOrgClient();
  const mutation = useSetLeadCourse(selectedClientId);
  const [editing, setEditing] = useState(false);
  const courseName = courseId ? (courses.find((c) => c.id === courseId)?.name ?? courseId) : null;

  if (!editable) return <span className="text-muted-foreground">{courseName ?? '—'}</span>;

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="text-muted-foreground underline-offset-2 hover:underline" title="Click to edit">
        {courseName ?? 'Add course'}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Select
        defaultValue={courseId ?? undefined}
        defaultOpen
        onValueChange={(value) => mutation.mutate({ leadId, courseId: value })}
        onOpenChange={(open) => {
          // Forcing `open` as a controlled prop here previously raced with Radix's own
          // close-on-select handling and could unmount this component before onValueChange
          // finished firing - selecting an option silently did nothing. `defaultOpen`
          // (uncontrolled) lets Radix manage its own lifecycle; this only syncs `editing` back
          // down once Radix decides to close, for any reason (selection, Escape, outside click).
          if (!open) setEditing(false);
        }}
      >
        <SelectTrigger className="h-7 w-40 text-xs">
          <SelectValue placeholder="Select course" />
        </SelectTrigger>
        <SelectContent>
          {courses.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {mutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
    </div>
  );
}

/**
 * This account doesn't use Meritto's Payments API (never wired up - see backend/merittoSync.ts),
 * so fee_paid never populates automatically. Enrollment itself comes from Meritto's own
 * lead_stage="Enrolled" disposition (real signal); revenue for those leads is entered here
 * manually since there's nowhere else it could come from for this account.
 *
 * Deliberately ignores the dashboard's date/course/source filters, unlike every other Overview
 * widget: this is a data-entry surface for "every currently-enrolled lead that needs a course or
 * revenue value filled in", not a filtered report - narrowing it by date/course/source would just
 * hide leads still waiting on manual entry from the person doing that entry.
 */
export function EnrolledLeadsRevenue() {
  const { selectedClientId, selectedRole } = useOrgClient();
  const query = useEnrolledLeads(selectedClientId);
  const coursesQuery = useFilterOptions(selectedClientId);
  const canEdit = !!selectedRole && EDITOR_ROLES.has(selectedRole);

  const courses = coursesQuery.data?.courses ?? [];

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
                    <TableCell>
                      <CourseCell leadId={lead.id} courseId={lead.courseId} courses={courses} editable={canEdit} />
                    </TableCell>
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
