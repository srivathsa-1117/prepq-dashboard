'use client';

import { useQuery } from '@tanstack/react-query';
import { getSyncStatus } from '../api/sync';
import type { AllSyncStatus } from '../types/api';

/** Powers the topbar's "Last synced / Data healthy" indicator - polled lightly since sync only runs once a morning, not for real-time updates. */
export function useSyncStatus(clientId: string | null) {
  return useQuery({
    queryKey: ['syncStatus', clientId],
    queryFn: () => getSyncStatus(clientId!) as Promise<AllSyncStatus>,
    enabled: !!clientId,
    refetchInterval: 5 * 60_000,
  });
}
