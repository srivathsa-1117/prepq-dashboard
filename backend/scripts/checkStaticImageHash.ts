import { httpJson } from '../src/utils/httpClient.js';

async function main() {
  const token = process.env.META_SYSTEM_USER_ACCESS_TOKEN;
  if (!token) throw new Error('no token');

  // "EA-NL -WEBINAR - MAY 30th | DNVK - Static | Chatgpt | MAY 22" - need its creative id.
  // Look it up broadly via the ad account first.
  const response = await httpJson<any>(`https://graph.facebook.com/v20.0/`, {
    method: 'GET',
    label: 'check-static',
    query: {
      access_token: token,
      ids: '1575513810737796',
      fields: 'id,name,image_url,image_hash,video_id,object_type,thumbnail_url,object_story_spec,asset_feed_spec',
    },
    retry: { maxAttempts: 1 },
  }).catch((err) => ({ error: err.cause?.body ?? err.message }));

  console.log(JSON.stringify(response, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
