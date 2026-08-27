import { MetaClient } from '../src/integrations/meta/metaClient.js';

async function main() {
  const token = process.env.META_SYSTEM_USER_ACCESS_TOKEN;
  if (!token) throw new Error('no token');
  const client = new MetaClient(token, 'act_1892794114540071');

  const hashes = ['9f7dfe7d89718f5ea9f914ec7107c456', 'c360eb1c1928a9cfe94949275aa3cb89'];
  const result = await client.fetchImageUrlsByHashes(hashes);
  console.log('resolved:', result.size, 'of', hashes.length);
  console.log(JSON.stringify([...result.entries()], null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
