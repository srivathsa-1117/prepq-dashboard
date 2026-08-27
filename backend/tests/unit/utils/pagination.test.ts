import { describe, it, expect } from 'vitest';
import { paginateAll, paginateAllStream } from '../../../src/utils/pagination.js';

describe('pagination', () => {
  it('follows cursors until nextCursor is null', async () => {
    const pages = [
      { items: [1, 2], nextCursor: 'a' },
      { items: [3, 4], nextCursor: 'b' },
      { items: [5], nextCursor: null },
    ];
    let calls = 0;

    const result = await paginateAll<number, string>(async (cursor) => {
      const expectedCursor = calls === 0 ? null : pages[calls - 1]!.nextCursor;
      expect(cursor).toBe(expectedCursor);
      return pages[calls++]!;
    });

    expect(result).toEqual([1, 2, 3, 4, 5]);
    expect(calls).toBe(3);
  });

  it('returns an empty array for a single empty page', async () => {
    const result = await paginateAll<number, string>(async () => ({ items: [], nextCursor: null }));
    expect(result).toEqual([]);
  });

  it('throws instead of looping forever when a cursor never advances to null', async () => {
    await expect(
      paginateAll<number, string>(async () => ({ items: [1], nextCursor: 'same-cursor-forever' }), { maxPages: 5 }),
    ).rejects.toThrow(/exceeded maxPages/);
  });

  it('streams pages one at a time via the async generator variant', async () => {
    const pages = [
      { items: ['x'], nextCursor: '1' },
      { items: ['y'], nextCursor: null },
    ];
    let calls = 0;
    const seen: string[][] = [];

    for await (const page of paginateAllStream<string, string>(async () => pages[calls++]!)) {
      seen.push(page);
    }

    expect(seen).toEqual([['x'], ['y']]);
  });
});
