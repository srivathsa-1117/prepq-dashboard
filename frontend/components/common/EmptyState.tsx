import { Inbox, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface EmptyStateProps {
  icon?: LucideIcon;
  title?: string;
  message?: string;
  className?: string;
}

/** Shown when an API call succeeds but returns nothing for the selected filters - never rendered as fake zeros (spec §14). */
export function EmptyState({ icon: Icon = Inbox, title = 'No data', message = 'No data for this period.', className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 text-center', className)}>
      <Icon className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}
