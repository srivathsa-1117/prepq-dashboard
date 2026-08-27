import { supabaseAdmin } from '../database/supabaseClient.js';
import type { Database } from '../types/database.js';

type TableName = keyof Database['public']['Tables'];
type Row<T extends TableName> = Database['public']['Tables'][T]['Row'];
type InsertRow<T extends TableName> = Database['public']['Tables'][T]['Insert'];

export interface UpsertCounts {
  created: number;
  updated: number;
}

/**
 * Idempotent upsert with created/updated accounting for sync_runs reporting.
 * Supabase's upsert() doesn't distinguish inserts from updates in its
 * response, so we diff the incoming keys against what already exists first.
 * This is a plain data-layer helper (batch size, key diffing), not a
 * provider abstraction - each repo still owns its own row shape and mapping.
 */
export async function upsertWithCounts<T extends TableName>(options: {
  table: T;
  rows: InsertRow<T>[];
  /** Postgres upsert conflict target, e.g. "client_id,meta_campaign_id". */
  onConflict: string;
  /** Columns identifying the natural key, used only to compute created-vs-updated counts. */
  keyColumns: (keyof Row<T> & string)[];
  batchSize?: number;
}): Promise<UpsertCounts> {
  const { table, rows, onConflict, keyColumns, batchSize = 500 } = options;
  if (rows.length === 0) return { created: 0, updated: 0 };

  const keyOf = (row: Record<string, unknown>): string => keyColumns.map((k) => String(row[k])).join('::');

  const incomingKeys = rows.map((r) => keyOf(r as Record<string, unknown>));

  // Existing-key lookup, scoped by the *set* of distinct values in the
  // batch's first key column (e.g. every ad_id present, not just the first
  // row's) - a single `.eq()` here would silently scope the lookup to one
  // row's value and misreport nearly everything else in the batch as
  // "created" for any table whose first key column isn't uniform across the
  // whole batch (true for every daily-metrics table, which spans many ads
  // per sync). Composite natural keys still aren't expressible as a single
  // `.in()`, so we pull everything in scope and diff the full key in memory -
  // fine at this data scale (per-client, per-sync).
  const firstKeyCol = keyColumns[0] as string;
  const scopeValues = [...new Set(rows.map((r) => (r as Record<string, unknown>)[firstKeyCol]).filter((v) => v !== undefined))];

  const existingKeySet = new Set<string>();
  if (scopeValues.length > 0) {
    // Paginated past PostgREST's default 1000-row response cap - a single `.select()` here
    // silently truncates once the account has more than 1000 existing rows in scope (true for
    // lead_activities well before this repo's other tables), which would only misreport the
    // created/updated counts below (the actual upsert isn't affected), but do it right anyway.
    const SELECT_PAGE_SIZE = 1000;
    for (let offset = 0; ; offset += SELECT_PAGE_SIZE) {
      const { data: existing, error: existingError } = await supabaseAdmin
        .from(table)
        .select(keyColumns.join(','))
        .in(firstKeyCol, scopeValues as never[])
        .order(firstKeyCol, { ascending: true })
        .range(offset, offset + SELECT_PAGE_SIZE - 1);
      if (existingError) throw existingError;
      // The select column list is a dynamic string, so postgrest-js can't
      // statically parse it into a named row shape - route through `unknown`
      // since the resulting type and Record<string, unknown> don't otherwise
      // overlap enough for a direct cast.
      for (const r of existing ?? []) existingKeySet.add(keyOf(r as unknown as Record<string, unknown>));
      if (!existing || existing.length < SELECT_PAGE_SIZE) break;
    }
  }

  let created = 0;
  let updated = 0;
  for (const key of incomingKeys) {
    if (existingKeySet.has(key)) updated += 1;
    else created += 1;
  }

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabaseAdmin.from(table).upsert(batch as never, { onConflict });
    if (error) throw error;
  }

  return { created, updated };
}
