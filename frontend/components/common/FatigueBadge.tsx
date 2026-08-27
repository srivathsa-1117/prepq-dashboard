import { TrendingDown, TrendingUp, Minus, HelpCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { FatigueResult } from '@/lib/types/api';

const CONFIG: Record<FatigueResult['trend'], { label: string; icon: typeof TrendingUp; variant: 'good' | 'bad' | 'warning' | 'default' }> = {
  improving: { label: 'Improving', icon: TrendingUp, variant: 'good' },
  declining: { label: 'Fatiguing', icon: TrendingDown, variant: 'bad' },
  steady: { label: 'Steady', icon: Minus, variant: 'default' },
  insufficient_data: { label: 'New', icon: HelpCircle, variant: 'default' },
};

/** Trailing-14d vs preceding-14d qualified-rate trend (spec: creative fatigue badge) - always "as of now", independent of the dashboard date filter. */
export function FatigueBadge({ fatigue }: { fatigue: FatigueResult | null | undefined }) {
  if (!fatigue) return null;
  const cfg = CONFIG[fatigue.trend];
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}
