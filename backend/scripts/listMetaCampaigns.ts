import { MetaClient } from '../src/integrations/meta/metaClient.js';

async function main() {
  const token = process.env.META_SYSTEM_USER_ACCESS_TOKEN;
  if (!token) throw new Error('META_SYSTEM_USER_ACCESS_TOKEN not set');

  const client = new MetaClient(token, 'act_1892794114540071');
  const all = [];
  for await (const page of client.streamCampaigns()) all.push(...page);

  console.log('count:', all.length);
  console.log(JSON.stringify(all.map((c) => ({ id: c.id, name: c.name, status: c.status })), null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
