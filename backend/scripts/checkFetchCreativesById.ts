import { MetaClient } from '../src/integrations/meta/metaClient.js';
import { transformCreative } from '../src/integrations/meta/metaTransform.js';

async function main() {
  const token = process.env.META_SYSTEM_USER_ACCESS_TOKEN;
  if (!token) throw new Error('no token');
  const client = new MetaClient(token, 'act_1892794114540071');

  const result = await client.fetchCreativesByIds(['1575513810737796']);
  console.log('raw:', JSON.stringify(result, null, 2));

  const normalized = result.map(transformCreative);
  console.log('normalized carouselImageHashes:', normalized[0]?.carouselImageHashes);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
