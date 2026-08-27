'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import { useFilterOptions } from '@/lib/hooks/useDashboardData';

export function SourceFilter({ value, onChange }: { value: string | undefined; onChange: (value: string | undefined) => void }) {
  const { selectedClientId } = useOrgClient();
  const { data } = useFilterOptions(selectedClientId);

  return (
    <Select value={value ?? 'all'} onValueChange={(v) => onChange(v === 'all' ? undefined : v)}>
      <SelectTrigger className="h-8 w-40 text-xs">
        <SelectValue placeholder="All sources" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All sources</SelectItem>
        {data?.sources.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
