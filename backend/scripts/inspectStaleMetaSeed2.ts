import { supabaseAdmin } from '../src/database/supabaseClient.js';

const CLIENT_ID = '5b49fb30-931a-4845-a5ca-1c624422b1a1';
const FAKE_CAMPAIGN_ID = '5b0b84bf-f180-4587-9ade-55606caa1272';

async function main() {
  const { data: adsets, error: adsetsErr } = await supabaseAdmin
    .from('meta_adsets')
    .select('id, name, meta_adset_id, campaign_id')
    .eq('client_id', CLIENT_ID)
    .eq('campaign_id', FAKE_CAMPAIGN_ID);
  if (adsetsErr) throw adsetsErr;
  console.log('adsets under fake campaign:', JSON.stringify(adsets, null, 2));

  const adsetIds = (adsets ?? []).map((a) => a.id);
  let adIds: string[] = [];
  if (adsetIds.length > 0) {
    const { data: ads, error: adsErr } = await supabaseAdmin
      .from('meta_ads')
      .select('id, name, meta_ad_id, adset_id, campaign_id')
      .in('adset_id', adsetIds);
    if (adsErr) throw adsErr;
    console.log('ads under fake adsets:', JSON.stringify(ads, null, 2));
    adIds = (ads ?? []).map((a) => a.id);
  }

  // Also check for ads directly tagged with the fake campaign_id (denormalized column), even if adset differs.
  const { data: adsByCampaign, error: adsByCampaignErr } = await supabaseAdmin
    .from('meta_ads')
    .select('id, name, meta_ad_id, adset_id, campaign_id')
    .eq('campaign_id', FAKE_CAMPAIGN_ID);
  if (adsByCampaignErr) throw adsByCampaignErr;
  console.log('ads with campaign_id = fake campaign:', JSON.stringify(adsByCampaign, null, 2));
  for (const a of adsByCampaign ?? []) if (!adIds.includes(a.id)) adIds.push(a.id);

  if (adIds.length > 0) {
    const { count: metricsCount, error: metricsErr } = await supabaseAdmin
      .from('meta_ad_daily_metrics')
      .select('id', { count: 'exact', head: true })
      .in('meta_ad_id', adIds);
    if (metricsErr) throw metricsErr;
    console.log('daily metrics rows tied to fake ads:', metricsCount, '(fake ad ids:', adIds, ')');
  } else {
    console.log('no fake ads found, no metrics to check');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
