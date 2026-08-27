import { supabaseAdmin } from '../src/database/supabaseClient.js';

const CLIENT_ID = '5b49fb30-931a-4845-a5ca-1c624422b1a1';
const STALE_INTEGRATION_ACCOUNT_ID = '6db02a47-5779-48aa-b80c-f2635c4db646';

async function count(table: string) {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('client_id', CLIENT_ID)
    .eq('integration_account_id', STALE_INTEGRATION_ACCOUNT_ID);
  if (error) throw error;
  return count;
}

async function main() {
  console.log('meta_campaigns:', await count('meta_campaigns'));
  console.log('meta_adsets:', await count('meta_adsets'));
  console.log('meta_ads:', await count('meta_ads'));

  const { data: acct, error: acctErr } = await supabaseAdmin
    .from('integration_accounts')
    .select('*')
    .eq('id', STALE_INTEGRATION_ACCOUNT_ID)
    .maybeSingle();
  if (acctErr) throw acctErr;
  console.log('integration_accounts row:', JSON.stringify(acct, null, 2));

  // meta_ad_daily_metrics has no integration_account_id column - it's keyed off meta_ad_id.
  const { data: staleAds } = await supabaseAdmin
    .from('meta_ads')
    .select('id')
    .eq('client_id', CLIENT_ID)
    .eq('integration_account_id', STALE_INTEGRATION_ACCOUNT_ID);
  const staleAdIds = (staleAds ?? []).map((a) => a.id);
  if (staleAdIds.length > 0) {
    const { count: metricsCount } = await supabaseAdmin
      .from('meta_ad_daily_metrics')
      .select('id', { count: 'exact', head: true })
      .in('meta_ad_id', staleAdIds);
    console.log('meta_ad_daily_metrics tied to stale ads:', metricsCount, '(stale ad ids:', staleAdIds.length, ')');
  } else {
    console.log('no stale meta_ads rows, so no stale metrics to check');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
