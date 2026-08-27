import type { IntegrationProvider, SyncRunStatus, SyncRunType } from './domain.js';

export interface SyncRun {
  id: string;
  clientId: string;
  syncJobId: string;
  provider: IntegrationProvider;
  status: SyncRunStatus;
  startedAt: string;
  completedAt: string | null;
  recordsFetched: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsFailed: number;
  errorMessage: string | null;
  /** sync_runs has no dedicated error_details/triggered_by/trigger_dev_run_id columns - all packed into the `metadata` jsonb column. */
  metadata: Record<string, unknown>;
}

/** Mutable counters a sync job accumulates while it runs, flushed to sync_runs at the end. */
export class SyncRunCounters {
  fetched = 0;
  created = 0;
  updated = 0;
  failed = 0;

  addFetched(n: number): void {
    this.fetched += n;
  }

  addUpsertResult(created: number, updated: number): void {
    this.created += created;
    this.updated += updated;
  }

  addFailed(n = 1): void {
    this.failed += n;
  }
}

export interface SyncSchedule {
  id: string;
  clientId: string;
  provider: IntegrationProvider;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  triggerDevScheduleId: string | null;
}

/** Result contract every provider-specific sync function returns to the orchestrator. */
export interface SyncOutcome {
  status: Extract<SyncRunStatus, 'success' | 'partial' | 'failed'>;
  counters: SyncRunCounters;
  errorMessage?: string;
  errorDetails?: Record<string, unknown>;
}

/** Standard params passed into every provider sync entrypoint. */
export interface SyncJobParams {
  clientId: string;
  /** integrations.id (the connected provider integration for this client). */
  integrationId: string;
  runType: SyncRunType;
  /** Inclusive lookback window in days for incremental syncs (attribution windows shift late data). */
  lookbackDays?: number;
  triggeredBy?: string | null;
}
