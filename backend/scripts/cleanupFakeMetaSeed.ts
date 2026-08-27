import { supabaseAdmin } from '../src/database/supabaseClient.js';

const FAKE_CAMPAIGN_ID = '5b0b84bf-f180-4587-9ade-55606caa1272';
const FAKE_ADSET_ID = 'c1867f42-b6e6-4b41-85e6-536fd36efee5';
const FAKE_AD_IDS = ['aef748b5-4a96-4653-bc10-dd787013d46f', 'b6ede807-8437-4917-afce-027c4572df05'];

async function main() {
  // 1. Null the dangling FKs on the 14 real leads that name-matched the fake campaign/adset/ad.
  const { data: fixedLeads, error: leadsErr } = await supabaseAdmin
    .from('leads')
    .update({ meta_campaign_id: null, meta_adset_id: null, meta_ad_id: null })
    .eq('meta_campaign_id', FAKE_CAMPAIGN_ID)
    .select('id');
  if (leadsErr) throw leadsErr;
  console.log('leads fixed (fake attribution nulled):', fixedLeads?.length);

  // 2. Delete fake daily metrics tied to the fake ads.
  const { error: metricsErr, count: metricsCount } = await supabaseAdmin
    .from('meta_ad_daily_metrics')
    .delete({ count: 'exact' })
    .in('meta_ad_id', FAKE_AD_IDS);
  if (metricsErr) throw metricsErr;
  console.log('fake daily metrics deleted:', metricsCount);

  // 3. Delete fake ads.
  const { error: adsErr, count: adsCount } = await supabaseAdmin.from('meta_ads').delete({ count: 'exact' }).in('id', FAKE_AD_IDS);
  if (adsErr) throw adsErr;
  console.log('fake ads deleted:', adsCount);

  // 4. Delete fake adset.
  const { error: adsetErr, count: adsetCount } = await supabaseAdmin.from('meta_adsets').delete({ count: 'exact' }).eq('id', FAKE_ADSET_ID);
  if (adsetErr) throw adsetErr;
  console.log('fake adset deleted:', adsetCount);

  // 5. Delete fake campaign.
  const { error: campaignErr, count: campaignCount } = await supabaseAdmin
    .from('meta_campaigns')
    .delete({ count: 'exact' })
    .eq('id', FAKE_CAMPAIGN_ID);
  if (campaignErr) throw campaignErr;
  console.log('fake campaign deleted:', campaignCount);

  const { count: finalCount, error: finalErr } = await supabaseAdmin
    .from('meta_campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', '5b49fb30-931a-4845-a5ca-1c624422b1a1');
  if (finalErr) throw finalErr;
  console.log('final meta_campaigns count:', finalCount);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
