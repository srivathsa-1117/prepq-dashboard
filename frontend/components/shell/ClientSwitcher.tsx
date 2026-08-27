'use client';

import { Building2, ChevronsUpDown } from 'lucide-react';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Lets the user switch org/client without logging out (spec §4). This
 * selection is a UI convenience only - every API call still sends
 * client_id, and the backend/RLS is the actual tenant boundary (see
 * lib/providers/OrgClientProvider.tsx).
 */
export function ClientSwitcher() {
  const { organizations, clients, selectedOrgId, selectedClientId, setSelectedOrgId, setSelectedClientId, isLoading } = useOrgClient();

  if (isLoading && organizations.length === 0) {
    return <Skeleton className="h-9 w-56" />;
  }

  return (
    <div className="flex items-center gap-1.5">
      {organizations.length > 1 && (
        // value is always a defined string (never undefined) so the Select stays controlled
        // across the render where selectedOrgId resolves from null - Radix warns ("changing from
        // uncontrolled to controlled") if a real id shows up after an initial undefined render.
        <Select value={selectedOrgId ?? ''} onValueChange={setSelectedOrgId}>
          <SelectTrigger className="h-9 w-auto min-w-[8rem] gap-1.5 border-none bg-transparent px-2 shadow-none hover:bg-chip">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue placeholder="Organization" />
          </SelectTrigger>
          <SelectContent>
            {organizations.map((m) => (
              <SelectItem key={m.organization.id} value={m.organization.id}>
                {m.organization.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {/* Same controlled-value fix as the org Select above. */}
      <Select value={selectedClientId ?? ''} onValueChange={setSelectedClientId}>
        <SelectTrigger className="h-9 w-56 gap-1.5">
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="Select a client" />
        </SelectTrigger>
        <SelectContent>
          {clients.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
          {clients.length === 0 && (
            <div className="px-2 py-3 text-xs text-muted-foreground">No clients available</div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
