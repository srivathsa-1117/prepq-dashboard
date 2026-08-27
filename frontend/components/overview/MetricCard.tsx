import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDeltaPct } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

interface MetricCardProps {
  label: string;
  value: string;
  sublabel?: string;
  deltaPct?: number | null;
}

/** KPI card with optional period-over-period comparison (spec §6) - delta is only shown where the backend actually computed one (currently: leads). */
export function MetricCard({ label, value, sublabel, deltaPct }: MetricCardProps) {
  const delta = deltaPct !== undefined && deltaPct !== null ? formatDeltaPct(deltaPct) : null;

  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-baseline gap-2 pt-0">
        <span className="text-2xl font-semibold tabular-nums text-foreground">{value}</span>
        {delta && (
          <span className={cn('text-xs font-medium tabular-nums', delta.positive ? 'text-good' : 'text-critical')}>{delta.text}</span>
        )}
        {sublabel && !delta && <span className="text-xs text-muted-foreground">{sublabel}</span>}
      </CardContent>
    </Card>
  );
}
