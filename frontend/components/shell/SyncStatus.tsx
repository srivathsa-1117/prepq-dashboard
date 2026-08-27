'use client';

import { CheckCircle2, AlertCircle, Clock, HelpCircle } from 'lucide-react';
import { useSyncStatus } from '@/lib/hooks/useSyncStatus';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import { formatDateTime } from '@/lib/utils/format';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils/cn';

/** Topbar "last synced" indicator (spec §5) - reflects the morning batch sync, not a live connection. */
export function SyncStatus() {
  const { selectedClientId } = useOrgClient();
  const { data, isLoading } = useSyncStatus(selectedClientId);

  if (isLoading || !data) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        <span>Syncing…</span>
      </div>
    );
  }

  const providers = data.providers ?? [];
  const lastSyncTimes = providers.map((p) => p.lastSuccessful?.completedAt).filter((t): t is string => !!t);
  const mostRecent = lastSyncTimes.sort().at(-1);
  const hasFailure = providers.some((p) => p.lastRun?.status === 'failed');
  const hasAny = providers.length > 0;

  const state = !hasAny ? 'none' : hasFailure ? 'error' : mostRecent ? 'ok' : 'pending';

  const config = {
    ok: { icon: CheckCircle2, label: 'Data healthy', className: 'text-good' },
    error: { icon: AlertCircle, label: 'Sync issue', className: 'text-critical' },
    pending: { icon: Clock, label: 'Awaiting first sync', className: 'text-warning' },
    none: { icon: HelpCircle, label: 'No integrations', className: 'text-muted-foreground' },
  }[state];

  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('flex items-center gap-1.5 text-xs', config.className)}>
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{config.label}</span>
            {mostRecent && <span className="hidden text-muted-foreground md:inline">· {formatDateTime(mostRecent)}</span>}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex flex-col gap-1">
            {providers.map((p) => (
              <div key={p.provider} className="flex items-center justify-between gap-4">
                <span className="capitalize">{p.provider.replace('_', ' ')}</span>
                <span className="text-muted-foreground">
                  {p.lastSuccessful?.completedAt ? formatDateTime(p.lastSuccessful.completedAt) : 'never synced'}
                </span>
              </div>
            ))}
            {providers.length === 0 && <span>No integrations connected yet.</span>}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
