import { apiFetch } from './client';
import type { AllSyncStatus, IntegrationProvider, SyncStatusForProvider } from '../types/api';

export function getSyncStatus(clientId: string, provider?: IntegrationProvider) {
  return apiFetch<SyncStatusForProvider | AllSyncStatus>('/api/sync/status', {
    params: { client_id: clientId, provider },
  });
}

export function triggerManualSync(clientId: string, provider: IntegrationProvider, lookbackDays?: number) {
  return apiFetch<{ triggerRunId: string }>(`/api/sync/${provider}/run`, {
    method: 'POST',
    body: { client_id: clientId, lookback_days: lookbackDays },
  });
}

export function updateSyncSchedule(
  clientId: string,
  provider: IntegrationProvider,
  input: { cron_expression: string; timezone: string; enabled: boolean },
) {
  return apiFetch<{ updated: boolean }>(`/api/sync/${provider}/schedule`, {
    method: 'PATCH',
    body: { client_id: clientId, ...input },
  });
}
