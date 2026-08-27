import { MetaClient } from '../src/integrations/meta/metaClient.js';
import { transformCreative } from '../src/integrations/meta/metaTransform.js';

async function main() {
  const token = process.env.META_SYSTEM_USER_ACCESS_TOKEN;
  if (!token) throw new Error('no token');
  const client = new MetaClient(token, 'act_1892794114540071');

  const allAds: any[] = [];
  for await (const page of client.streamAds()) allAds.push(...page);

  const creativeIds = [...new Set(allAds.map((a) => a.creative?.id).filter(Boolean))];
  console.log('unique creative ids:', creativeIds.length);

  const details = await client.fetchCreativesByIds(creativeIds);
  const normalized = details.map(transformCreative);
  const withVideo = normalized.filter((c) => c.videoId);
  console.log('creatives with a video_id:', withVideo.length, 'of', normalized.length);
  console.log('sample:', JSON.stringify(withVideo.slice(0, 3), null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
