import { supabaseAdmin } from '../src/database/supabaseClient.js';

const CLIENT_ID = '5b49fb30-931a-4845-a5ca-1c624422b1a1';

async function main() {
  const [campaigns, adsets, ads, metrics] = await Promise.all([
    supabaseAdmin.from('meta_campaigns').select('id', { count: 'exact', head: true }).eq('client_id', CLIENT_ID),
    supabaseAdmin.from('meta_adsets').select('id', { count: 'exact', head: true }).eq('client_id', CLIENT_ID),
    supabaseAdmin.from('meta_ads').select('id', { count: 'exact', head: true }).eq('client_id', CLIENT_ID),
    supabaseAdmin.from('meta_ad_daily_metrics').select('id', { count: 'exact', head: true }).eq('client_id', CLIENT_ID),
  ]);

  console.log('meta_campaigns:', campaigns.count, campaigns.error?.message);
  console.log('meta_adsets:', adsets.count, adsets.error?.message);
  console.log('meta_ads:', ads.count, ads.error?.message);
  console.log('meta_ad_daily_metrics:', metrics.count, metrics.error?.message);

  const sample = await supabaseAdmin
    .from('meta_ad_daily_metrics')
    .select('date, spend, impressions, clicks, meta_ad_id')
    .eq('client_id', CLIENT_ID)
    .order('date', { ascending: false })
    .limit(5);
  console.log('sample rows:', JSON.stringify(sample.data, null, 2));

  const totalSpend = await supabaseAdmin.from('meta_ad_daily_metrics').select('spend').eq('client_id', CLIENT_ID);
  const sum = (totalSpend.data ?? []).reduce((acc, r) => acc + Number(r.spend ?? 0), 0);
  console.log('total spend across all rows:', sum);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
