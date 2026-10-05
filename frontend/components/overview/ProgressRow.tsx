'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export function ProgressRow({
  label,
  target,
  actual,
  format,
  detail,
}: {
  label: string;
  target: number;
  actual: number;
  format: (n: number) => string;
  detail?: ReactNode;
}) {
  const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground">
          {format(actual)} of {format(target)}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-chip">
        <div className={cn('h-1.5 rounded-full', pct >= 100 ? 'bg-good' : 'bg-primary')} style={{ width: `${pct}%` }} />
      </div>
      {detail && <div className="flex items-center justify-between text-xs">{detail}</div>}
    </div>
  );
}
