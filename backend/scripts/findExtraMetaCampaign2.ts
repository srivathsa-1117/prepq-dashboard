import { supabaseAdmin } from '../src/database/supabaseClient.js';

const CLIENT_ID = '5b49fb30-931a-4845-a5ca-1c624422b1a1';

// Captured from the earlier successful listMetaCampaigns.ts run against Meta's real API.
const REAL_CAMPAIGN_IDS = new Set([
  '120245922021230382', '120243476839750382', '120243465466460382', '120243459027050382',
  '120242266954050382', '120241513668400382', '120240594801710382', '120240172446800382',
  '120240139067220382', '120239834665690382', '120239645193470382', '120239606618010382',
  '120239602428220382', '120232490077700382', '120231530475260382', '120230996564780382',
  '120229588969860382', '120226725554610382', '120226036838290382', '120225542109710382',
  '120223311576500382', '120222708003250382', '120222707695200382', '120218774820570382',
  '120216715715470382', '120216713331930382', '120216191334770382', '120215810734660382',
  '120215806423590382', '120215633154900382', '120215277776890382', '120215247699630382',
  '120213784946050382', '120213784580420382', '120213353793650382', '120213353542790382',
  '120213241288460382', '120213240433380382',
]);

async function main() {
  const { data, error } = await supabaseAdmin
    .from('meta_campaigns')
    .select('id, meta_campaign_id, name, status, created_at, integration_account_id')
    .eq('client_id', CLIENT_ID);
  if (error) throw error;

  console.log('DB rows:', data?.length);
  for (const row of data ?? []) {
    if (!REAL_CAMPAIGN_IDS.has(row.meta_campaign_id)) {
      console.log('EXTRA (not in real Meta campaign list):', JSON.stringify(row, null, 2));
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
