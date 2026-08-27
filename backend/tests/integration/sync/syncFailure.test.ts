import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  createSyncRun: vi.fn(),
  completeSyncRun: vi.fn(),
}));

vi.mock('../../../src/repositories/syncRunsRepo.js', () => ({
  createSyncRun: mocks.createSyncRun,
  completeSyncRun: mocks.completeSyncRun,
}));

const { runTrackedSync } = await import('../../../src/sync/syncRunTracker.js');

const BASE_RUN = { id: 'run-1', syncJobId: 'job-1', startedAt: '2026-08-17T06:00:00.000Z' };

describe('runTrackedSync (sync_runs bookkeeping)', () => {
  beforeEach(() => {
    mocks.createSyncRun.mockReset();
    mocks.completeSyncRun.mockReset();
    mocks.createSyncRun.mockResolvedValue(BASE_RUN);
  });

  it('marks the run success when the executor completes with no failed records', async () => {
    const result = await runTrackedSync(
      { clientId: 'client-a', integrationId: 'int-1', provider: 'meta', runType: 'scheduled' },
      async (counters) => {
        counters.addFetched(10);
        counters.addUpsertResult(4, 6);
      },
    );

    expect(result.status).toBe('success');
    expect(mocks.completeSyncRun).toHaveBeenCalledWith(
      'run-1',
      'job-1',
      expect.objectContaining({ status: 'success', startedAt: BASE_RUN.startedAt }),
    );
  });

  it('marks the run partial when some records failed but the executor did not throw', async () => {
    const result = await runTrackedSync(
      { clientId: 'client-a', integrationId: 'int-1', provider: 'meritto', runType: 'scheduled' },
      async (counters) => {
        counters.addFetched(10);
        counters.addUpsertResult(8, 0);
        counters.addFailed(2); // e.g. 2 leads whose activities failed to fetch, per sync/meritto/merittoSync.ts
      },
    );

    expect(result.status).toBe('partial');
    expect(result.counters.failed).toBe(2);
  });

  it('marks the run failed and records the error message/details when the executor throws', async () => {
    const result = await runTrackedSync(
      { clientId: 'client-a', integrationId: 'int-1', provider: 'google_ads', runType: 'manual' },
      async () => {
        throw new Error('Google Ads API: developer token not approved');
      },
    );

    expect(result.status).toBe('failed');
    expect(mocks.completeSyncRun).toHaveBeenCalledWith(
      'run-1',
      'job-1',
      expect.objectContaining({
        status: 'failed',
        errorMessage: 'Google Ads API: developer token not approved',
      }),
    );
  });

  it('never lets a thrown error propagate out of runTrackedSync - callers always get a result, not an exception', async () => {
    await expect(
      runTrackedSync({ clientId: 'client-a', integrationId: 'int-1', provider: 'meta', runType: 'scheduled' }, async () => {
        throw new Error('boom');
      }),
    ).resolves.toMatchObject({ status: 'failed' });
  });

  it('is independently rerunnable: a failed run does not prevent a fresh createSyncRun on the next attempt', async () => {
    await runTrackedSync({ clientId: 'client-a', integrationId: 'int-1', provider: 'meta', runType: 'manual' }, async () => {
      throw new Error('first attempt fails');
    });

    mocks.createSyncRun.mockResolvedValue({ id: 'run-2', syncJobId: 'job-1', startedAt: '2026-08-17T06:05:00.000Z' });
    const secondAttempt = await runTrackedSync(
      { clientId: 'client-a', integrationId: 'int-1', provider: 'meta', runType: 'manual' },
      async (counters) => counters.addUpsertResult(1, 0),
    );

    expect(mocks.createSyncRun).toHaveBeenCalledTimes(2);
    expect(secondAttempt.syncRunId).toBe('run-2');
    expect(secondAttempt.status).toBe('success');
  });
});
