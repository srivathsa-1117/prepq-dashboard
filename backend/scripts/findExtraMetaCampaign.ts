import { supabaseAdmin } from '../src/database/supabaseClient.js';
import { MetaClient } from '../src/integrations/meta/metaClient.js';

const CLIENT_ID = '5b49fb30-931a-4845-a5ca-1c624422b1a1';

async function main() {
  const token = process.env.META_SYSTEM_USER_ACCESS_TOKEN;
  if (!token) throw new Error('META_SYSTEM_USER_ACCESS_TOKEN not set');

  const client = new MetaClient(token, 'act_1892794114540071');
  const realIds = new Set<string>();
  for await (const page of client.streamCampaigns()) for (const c of page) realIds.add(c.id);

  const { data, error } = await supabaseAdmin
    .from('meta_campaigns')
    .select('id, meta_campaign_id, name, status, created_at, integration_account_id')
    .eq('client_id', CLIENT_ID);
  if (error) throw error;

  console.log('DB rows:', data?.length);
  for (const row of data ?? []) {
    if (!realIds.has(row.meta_campaign_id)) {
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
