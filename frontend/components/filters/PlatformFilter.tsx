'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const PLATFORMS = [
  { value: 'meta', label: 'Meta' },
  { value: 'google', label: 'Google' },
] as const;

/**
 * Campaigns/Creatives pages filter by ad platform, not lead source - the
 * backend's `source` query param doubles as a platform filter for
 * spend-only aggregations (see reportingService.ts::spendFilterFor), so
 * this writes to the same `source` filter key as SourceFilter but presents
 * platform options instead of lead-source options.
 */
export function PlatformFilter({ value, onChange }: { value: string | undefined; onChange: (value: string | undefined) => void }) {
  return (
    <Select value={value ?? 'all'} onValueChange={(v) => onChange(v === 'all' ? undefined : v)}>
      <SelectTrigger className="h-8 w-36 text-xs">
        <SelectValue placeholder="All platforms" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All platforms</SelectItem>
        {PLATFORMS.map((p) => (
          <SelectItem key={p.value} value={p.value}>
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
