'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import { useFilterOptions } from '@/lib/hooks/useDashboardData';

export function CourseFilter({ value, onChange }: { value: string | undefined; onChange: (value: string | undefined) => void }) {
  const { selectedClientId } = useOrgClient();
  const { data } = useFilterOptions(selectedClientId);

  return (
    <Select value={value ?? 'all'} onValueChange={(v) => onChange(v === 'all' ? undefined : v)}>
      <SelectTrigger className="h-8 w-40 text-xs">
        <SelectValue placeholder="All courses" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All courses</SelectItem>
        {data?.courses.map((c) => (
          <SelectItem key={c.id} value={c.code}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
