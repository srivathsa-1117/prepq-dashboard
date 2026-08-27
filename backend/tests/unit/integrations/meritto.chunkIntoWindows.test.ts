import { describe, it, expect } from 'vitest';
import { chunkIntoWindows } from '../../../src/integrations/meritto/merittoClient.js';

describe('chunkIntoWindows', () => {
  it('splits a 90-day range into three consecutive 30-day windows', () => {
    const from = new Date('2026-05-20T00:00:00.000Z');
    const to = new Date('2026-08-18T00:00:00.000Z'); // 90 days later

    const windows = chunkIntoWindows(from, to);

    expect(windows).toHaveLength(3);
    expect(windows[0]!.from).toEqual(from);
    expect(windows[2]!.to).toEqual(to);
    // consecutive windows are contiguous - each window's end is the next window's start
    expect(windows[0]!.to).toEqual(windows[1]!.from);
    expect(windows[1]!.to).toEqual(windows[2]!.from);
  });

  it('returns a single window when the range is already <=30 days', () => {
    const from = new Date('2026-08-01T00:00:00.000Z');
    const to = new Date('2026-08-10T00:00:00.000Z');
    const windows = chunkIntoWindows(from, to);
    expect(windows).toEqual([{ from, to }]);
  });

  it('returns no windows for an empty (from >= to) range', () => {
    const date = new Date('2026-08-10T00:00:00.000Z');
    expect(chunkIntoWindows(date, date)).toEqual([]);
  });

  it('never produces a window wider than the requested max days', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-04-15T00:00:00.000Z'); // 104 days
    const windows = chunkIntoWindows(from, to, 30);
    for (const w of windows) {
      expect(w.to.getTime() - w.from.getTime()).toBeLessThanOrEqual(30 * 86_400_000);
    }
  });
});
