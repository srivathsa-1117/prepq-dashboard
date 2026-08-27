import { MetaClient } from '../src/integrations/meta/metaClient.js';
import { transformCreative } from '../src/integrations/meta/metaTransform.js';

async function main() {
  const token = process.env.META_SYSTEM_USER_ACCESS_TOKEN;
  if (!token) throw new Error('no token');
  const client = new MetaClient(token, 'act_1892794114540071');

  const allAds: any[] = [];
  for await (const page of client.streamAds()) allAds.push(...page);
  const creativeIds = [...new Set(allAds.map((a) => a.creative?.id).filter(Boolean))];
  console.log('total unique creative ids (real scale):', creativeIds.length);

  const raw = await client.fetchCreativesByIds(creativeIds);
  console.log('raw creatives returned:', raw.length, 'of', creativeIds.length, 'requested');

  const missingIds = creativeIds.filter((id) => !raw.some((r) => r.id === id));
  console.log('missing entirely from response:', missingIds.length);
  console.log('sample missing ids:', missingIds.slice(0, 10));

  const normalized = raw.map(transformCreative);
  const deadEnd = normalized.filter((c) => c.carouselImageHashes.length === 0 && !c.videoId && !c.imageUrl);
  console.log('present but with no usable image/video data:', deadEnd.length);

  // Specifically check our known-problem id.
  const known = raw.find((r) => r.id === '1575513810737796');
  console.log('known problem id present in this batch?', !!known);
  if (known) console.log(JSON.stringify(transformCreative(known).carouselImageHashes));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
