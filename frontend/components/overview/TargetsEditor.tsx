'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AsyncSection } from '@/components/common/AsyncSection';
import { ProgressRow } from '@/components/overview/ProgressRow';
import { useOverview, useFilterOptions, useTargets, useSaveTargets } from '@/lib/hooks/useDashboardData';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import type { DashboardFilterState } from '@/lib/hooks/useDashboardFilters';
import { formatCurrencyCompact, formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

const EDITOR_ROLES = new Set(['manager', 'admin', 'owner']);

function currentMonthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

type DraftRow = { courseId: string; leadTarget: string; qualifiedTarget: string; enrollmentTarget: string; revenueTarget: string };

function EditTargetsDialog({
  open,
  onOpenChange,
  clientId,
  month,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  month: string;
}) {
  const coursesQuery = useFilterOptions(clientId);
  const targetsQuery = useTargets(clientId, month);
  const saveMutation = useSaveTargets(clientId);
  const [draft, setDraft] = useState<DraftRow[]>([]);

  useEffect(() => {
    if (!open || !coursesQuery.data) return;
    const existing = targetsQuery.data?.targets ?? [];
    setDraft(
      coursesQuery.data.courses.map((c) => {
        const t = existing.find((e) => e.courseId === c.id);
        return {
          courseId: c.id,
          leadTarget: String(t?.leadTarget ?? 0),
          qualifiedTarget: String(t?.qualifiedTarget ?? 0),
          enrollmentTarget: String(t?.enrollmentTarget ?? 0),
          revenueTarget: String(t?.revenueTarget ?? 0),
        };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, coursesQuery.data, targetsQuery.data]);

  function updateRow(courseId: string, field: keyof Omit<DraftRow, 'courseId'>, value: string) {
    setDraft((rows) => rows.map((r) => (r.courseId === courseId ? { ...r, [field]: value } : r)));
  }

  function handleSave() {
    saveMutation.mutate(
      {
        client_id: clientId,
        month,
        targets: draft.map((r) => ({
          course_id: r.courseId,
          lead_target: Math.max(0, Math.round(Number(r.leadTarget) || 0)),
          qualified_target: Math.max(0, Math.round(Number(r.qualifiedTarget) || 0)),
          enrollment_target: Math.max(0, Math.round(Number(r.enrollmentTarget) || 0)),
          revenue_target: Math.max(0, Number(r.revenueTarget) || 0),
        })),
      },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  const courseName = (id: string) => coursesQuery.data?.courses.find((c) => c.id === id)?.name ?? id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit targets — {month.slice(0, 7)}</DialogTitle>
          <DialogDescription>Set monthly goals per course. These drive the target-vs-actual comparisons across the dashboard.</DialogDescription>
        </DialogHeader>

        {coursesQuery.isLoading || targetsQuery.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto py-2">
            {draft.map((row) => (
              <div key={row.courseId} className="flex flex-col gap-2 border-b border-border pb-4 last:border-0">
                <span className="text-sm font-medium text-foreground">{courseName(row.courseId)}</span>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Leads</Label>
                    <Input type="number" min={0} value={row.leadTarget} onChange={(e) => updateRow(row.courseId, 'leadTarget', e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Qualified</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.qualifiedTarget}
                      onChange={(e) => updateRow(row.courseId, 'qualifiedTarget', e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Enrolled</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.enrollmentTarget}
                      onChange={(e) => updateRow(row.courseId, 'enrollmentTarget', e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Revenue</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.revenueTarget}
                      onChange={(e) => updateRow(row.courseId, 'revenueTarget', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
            {draft.length === 0 && <p className="text-sm text-muted-foreground">No courses configured for this client yet.</p>}
          </div>
        )}

        {saveMutation.isError && <p className="text-sm text-critical">Couldn&apos;t save targets. Try again.</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending || draft.length === 0}>
            {saveMutation.isPending ? 'Saving...' : 'Save targets'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TargetsEditor({ filters }: { filters: DashboardFilterState }) {
  const { selectedClientId, selectedRole } = useOrgClient();
  const query = useOverview(selectedClientId, filters);
  const [editorOpen, setEditorOpen] = useState(false);
  const canEdit = !!selectedRole && EDITOR_ROLES.has(selectedRole);
  const month = currentMonthStart();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Targets (this month)</CardTitle>
        {canEdit && selectedClientId && (
          <Button variant="outline" size="sm" onClick={() => setEditorOpen(true)}>
            Edit targets
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <AsyncSection
          isLoading={query.isLoading}
          isError={query.isError}
          data={query.data}
          onRetry={() => query.refetch()}
          isEmpty={(d) => !d.monthlyTargets}
          emptyMessage="No targets set for this month yet."
        >
          {(data) => {
            const t = data.monthlyTargets;
            if (!t) return null;
            const pacing = data.targetPacing;
            const ahead = pacing ? pacing.aheadBehind >= 0 : false;
            return (
              <div className="flex flex-col gap-4">
                <ProgressRow
                  label="Leads"
                  target={t.leads.target}
                  actual={t.leads.actual}
                  format={formatNumber}
                  detail={
                    pacing && (
                      <>
                        <span className={cn('font-medium', ahead ? 'text-good' : 'text-critical')}>
                          {ahead ? '+' : ''}
                          {formatNumber(Math.round(pacing.aheadBehind))} vs. expected
                        </span>
                        <span className="text-muted-foreground">{formatNumber(Math.round(pacing.requiredDailyRunRate))}/day needed</span>
                      </>
                    )
                  }
                />
                <ProgressRow label="Qualified" target={t.qualified.target} actual={t.qualified.actual} format={formatNumber} />
                <ProgressRow label="Enrolled" target={t.enrolled.target} actual={t.enrolled.actual} format={formatNumber} />
                <ProgressRow label="Revenue" target={t.revenue.target} actual={t.revenue.actual} format={formatCurrencyCompact} />
              </div>
            );
          }}
        </AsyncSection>
      </CardContent>

      {selectedClientId && <EditTargetsDialog open={editorOpen} onOpenChange={setEditorOpen} clientId={selectedClientId} month={month} />}
    </Card>
  );
}
