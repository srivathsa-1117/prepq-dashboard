'use client';

import { LayoutGrid, List } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'ready', label: 'Ready' },
  { value: 'active', label: 'Live' },
  { value: 'paused', label: 'Paused' },
  { value: 'archived', label: 'Archived' },
];

const SORT_OPTIONS = [
  { value: 'spend', label: 'Spend' },
  { value: 'leads', label: 'Leads' },
  { value: 'qualifiedRate', label: 'Qualified rate' },
  { value: 'roas', label: 'ROAS' },
  { value: 'recent', label: 'Most recent' },
];

export interface CreativeGridControls {
  search: string;
  status: string;
  sort: string;
  view: 'grid' | 'list';
}

export function CreativeFilters({ controls, onChange }: { controls: CreativeGridControls; onChange: (patch: Partial<CreativeGridControls>) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={controls.search}
        onChange={(e) => onChange({ search: e.target.value })}
        placeholder="Search creatives…"
        className="h-8 w-56 text-xs"
      />
      <Select value={controls.status} onValueChange={(status) => onChange({ status })}>
        <SelectTrigger className="h-8 w-36 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={controls.sort} onValueChange={(sort) => onChange({ sort })}>
        <SelectTrigger className="h-8 w-40 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              Sort: {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="ml-auto flex items-center gap-0.5 rounded-md border border-border p-0.5">
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-7 w-7', controls.view === 'grid' && 'bg-chip')}
          onClick={() => onChange({ view: 'grid' })}
          aria-label="Grid view"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-7 w-7', controls.view === 'list' && 'bg-chip')}
          onClick={() => onChange({ view: 'list' })}
          aria-label="List view"
        >
          <List className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
