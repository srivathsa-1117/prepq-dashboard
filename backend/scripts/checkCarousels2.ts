import { MetaClient } from '../src/integrations/meta/metaClient.js';
import { httpJson } from '../src/utils/httpClient.js';

async function main() {
  const token = process.env.META_SYSTEM_USER_ACCESS_TOKEN;
  if (!token) throw new Error('no token');
  const client = new MetaClient(token, 'act_1892794114540071');

  const allAds: any[] = [];
  for await (const page of client.streamAds()) allAds.push(...page);
  const creativeIds = [...new Set(allAds.map((a) => a.creative?.id).filter(Boolean))];
  console.log('unique creative ids:', creativeIds.length);

  const chunks: string[][] = [];
  for (let i = 0; i < creativeIds.length; i += 50) chunks.push(creativeIds.slice(i, i + 50));

  let carouselCount = 0;
  let sample: any = null;
  const objectTypes = new Set<string>();

  for (const chunk of chunks) {
    const response = await httpJson<Record<string, any>>(`https://graph.facebook.com/v20.0/`, {
      method: 'GET',
      label: 'check2',
      query: { access_token: token, ids: chunk.join(','), fields: 'id,object_type,object_story_spec' },
      retry: { maxAttempts: 3, minTimeoutMs: 3000, maxTimeoutMs: 10000 },
    });
    for (const c of Object.values(response)) {
      if (c.object_type) objectTypes.add(c.object_type);
      const childAttachments = c.object_story_spec?.link_data?.child_attachments;
      if (childAttachments && childAttachments.length > 0) {
        carouselCount++;
        if (!sample) sample = c;
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log('object_types seen:', [...objectTypes]);
  console.log('carousel count:', carouselCount);
  if (sample) console.log(JSON.stringify(sample, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
