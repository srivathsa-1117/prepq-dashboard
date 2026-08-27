/**
 * Small pagination helper shared across the three integration clients. This
 * is intentionally NOT a generic "connector" abstraction - each client
 * decides its own cursor/page-token semantics and just supplies a `fetchPage`
 * function; this only owns the "keep calling until there's no next page"
 * loop and a safety cap so a provider bug can't spin forever.
 */

export interface Page<TItem, TCursor> {
  items: TItem[];
  nextCursor: TCursor | null;
}

export interface PaginateAllOptions {
  /** Hard stop so a pagination bug (e.g. a cursor that never advances) can't loop forever against a live API. */
  maxPages?: number;
}

export async function paginateAll<TItem, TCursor>(
  fetchPage: (cursor: TCursor | null) => Promise<Page<TItem, TCursor>>,
  options: PaginateAllOptions = {},
): Promise<TItem[]> {
  const maxPages = options.maxPages ?? 500;
  const results: TItem[] = [];
  let cursor: TCursor | null = null;
  let pageCount = 0;

  do {
    const page = await fetchPage(cursor);
    results.push(...page.items);
    cursor = page.nextCursor;
    pageCount += 1;

    if (pageCount >= maxPages) {
      throw new Error(`paginateAll: exceeded maxPages (${maxPages}) - possible non-advancing cursor`);
    }
  } while (cursor !== null);

  return results;
}

/** Async-generator variant for callers that want to process/upsert page-by-page instead of buffering everything in memory. */
export async function* paginateAllStream<TItem, TCursor>(
  fetchPage: (cursor: TCursor | null) => Promise<Page<TItem, TCursor>>,
  options: PaginateAllOptions = {},
): AsyncGenerator<TItem[], void, void> {
  const maxPages = options.maxPages ?? 500;
  let cursor: TCursor | null = null;
  let pageCount = 0;

  do {
    const page = await fetchPage(cursor);
    yield page.items;
    cursor = page.nextCursor;
    pageCount += 1;

    if (pageCount >= maxPages) {
      throw new Error(`paginateAllStream: exceeded maxPages (${maxPages}) - possible non-advancing cursor`);
    }
  } while (cursor !== null);
}
