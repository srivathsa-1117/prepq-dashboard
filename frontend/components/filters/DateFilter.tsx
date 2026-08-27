'use client';

import { useState } from 'react';
import { Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { DateRangePreset } from '@/lib/types/api';
import type { DashboardFilterState } from '@/lib/hooks/useDashboardFilters';
import { cn } from '@/lib/utils/cn';

const PRESETS: Array<{ value: DateRangePreset; label: string }> = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: 'mtd', label: 'MTD' },
  { value: 'qtd', label: 'QTD' },
];

export function DateFilter({ filters, setFilters }: { filters: DashboardFilterState; setFilters: (patch: Partial<DashboardFilterState>) => void }) {
  const isCustom = !!(filters.dateFrom && filters.dateTo);
  const [from, setFrom] = useState(filters.dateFrom ?? '');
  const [to, setTo] = useState(filters.dateTo ?? '');
  const [open, setOpen] = useState(false);

  function applyCustom() {
    if (from && to) {
      setFilters({ dateFrom: from, dateTo: to });
      setOpen(false);
    }
  }

  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
      {PRESETS.map((p) => (
        <button
          key={p.value}
          onClick={() => setFilters({ range: p.value, dateFrom: undefined, dateTo: undefined })}
          className={cn(
            'rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors',
            !isCustom && filters.range === p.value ? 'bg-chip text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {p.label}
        </button>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant={isCustom ? 'secondary' : 'ghost'} size="sm" className="h-7 gap-1 px-2 text-xs">
            <Calendar className="h-3.5 w-3.5" />
            {isCustom ? `${filters.dateFrom} → ${filters.dateTo}` : 'Custom'}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="date-from">From</Label>
              <Input id="date-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="date-to">To</Label>
              <Input id="date-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <Button size="sm" onClick={applyCustom} disabled={!from || !to}>
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
