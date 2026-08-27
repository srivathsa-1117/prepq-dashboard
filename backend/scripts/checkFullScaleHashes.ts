import { MetaClient } from '../src/integrations/meta/metaClient.js';
import { transformCreative } from '../src/integrations/meta/metaTransform.js';

async function main() {
  const token = process.env.META_SYSTEM_USER_ACCESS_TOKEN;
  if (!token) throw new Error('no token');
  const client = new MetaClient(token, 'act_1892794114540071');

  const allAds: any[] = [];
  for await (const page of client.streamAds()) allAds.push(...page);
  const creativeIds = [...new Set(allAds.map((a) => a.creative?.id).filter(Boolean))];

  const raw = await client.fetchCreativesByIds(creativeIds);
  const normalized = raw.map(transformCreative);

  const uniqueHashes = [...new Set(normalized.flatMap((c) => c.carouselImageHashes))];
  console.log('total unique image hashes to resolve:', uniqueHashes.length);

  const resolved = await client.fetchImageUrlsByHashes(uniqueHashes);
  console.log('resolved:', resolved.size, 'of', uniqueHashes.length, 'requested');

  const missing = uniqueHashes.filter((h) => !resolved.has(h));
  console.log('missing hashes:', missing.length);
  console.log('sample missing:', missing.slice(0, 10));

  console.log('known problem hashes resolved?', resolved.has('9f7dfe7d89718f5ea9f914ec7107c456'), resolved.has('c360eb1c1928a9cfe94949275aa3cb89'));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
