import { MetaClient } from '../src/integrations/meta/metaClient.js';
import { supabaseAdmin } from '../src/database/supabaseClient.js';

const CLIENT_ID = '5b49fb30-931a-4845-a5ca-1c624422b1a1';
const AD_ACCOUNT_ID = 'act_1892794114540071';

async function main() {
  const token = process.env.META_SYSTEM_USER_ACCESS_TOKEN;
  if (!token) throw new Error('META_SYSTEM_USER_ACCESS_TOKEN not set');

  const since = '2026-08-18';
  const until = '2026-08-24';

  const client = new MetaClient(token, AD_ACCOUNT_ID);
  const realByAdDate = new Map<string, { spend: number; impressions: number; clicks: number }>();
  for await (const page of client.streamDailyInsights(since, until)) {
    for (const row of page) {
      const key = `${row.ad_id}:${row.date_start}`;
      realByAdDate.set(key, {
        spend: Number(row.spend ?? 0),
        impressions: Number(row.impressions ?? 0),
        clicks: Number(row.clicks ?? 0),
      });
    }
  }
  console.log('Real (Meta API) rows:', realByAdDate.size);

  // Pull our stored per-ad-per-day rows for the same window, joined to the platform ad id.
  const { data: adRows, error: adErr } = await supabaseAdmin
    .from('meta_ads')
    .select('id, meta_ad_id, name')
    .eq('client_id', CLIENT_ID);
  if (adErr) throw adErr;
  const nameByInternalId = new Map((adRows ?? []).map((a) => [a.id, { platformId: a.meta_ad_id, name: a.name }]));

  const { data: metricRows, error: metricErr } = await supabaseAdmin
    .from('meta_ad_daily_metrics')
    .select('meta_ad_id, date, spend, impressions, clicks')
    .eq('client_id', CLIENT_ID)
    .gte('date', since)
    .lte('date', until);
  if (metricErr) throw metricErr;

  const dbByAdDate = new Map<string, { spend: number; impressions: number; clicks: number }>();
  for (const r of metricRows ?? []) {
    const platformId = nameByInternalId.get(r.meta_ad_id)?.platformId;
    if (!platformId) continue;
    const key = `${platformId}:${r.date}`;
    dbByAdDate.set(key, { spend: Number(r.spend), impressions: r.impressions, clicks: r.clicks });
  }
  console.log('DB rows (mapped to platform ad id):', dbByAdDate.size);

  let mismatches = 0;
  let missingInDb = 0;
  let missingInMeta = 0;
  const allKeys = new Set([...realByAdDate.keys(), ...dbByAdDate.keys()]);
  for (const key of allKeys) {
    const real = realByAdDate.get(key);
    const db = dbByAdDate.get(key);
    if (!real) {
      missingInMeta++;
      continue;
    }
    if (!db) {
      missingInDb++;
      console.log('MISSING IN DB:', key, real);
      continue;
    }
    const spendDiff = Math.abs(real.spend - db.spend);
    const impDiff = Math.abs(real.impressions - db.impressions);
    const clickDiff = Math.abs(real.clicks - db.clicks);
    if (spendDiff > 1 || impDiff > 2 || clickDiff > 2) {
      mismatches++;
      console.log('MISMATCH:', key, { real, db });
    }
  }

  console.log('--- summary ---');
  console.log('total real rows:', realByAdDate.size);
  console.log('total db rows:', dbByAdDate.size);
  console.log('missing in db (real has, db lacks):', missingInDb);
  console.log('missing in meta (db has extra, real lacks):', missingInMeta);
  console.log('value mismatches (beyond rounding tolerance):', mismatches);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
