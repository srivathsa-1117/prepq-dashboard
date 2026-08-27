import { httpJson } from '../src/utils/httpClient.js';

async function main() {
  const token = process.env.META_SYSTEM_USER_ACCESS_TOKEN;
  if (!token) throw new Error('no token');

  // A known real video_id from the earlier scan (Scope of US CPA...).
  const videoId = '2101903767030799';

  const response = await httpJson<any>(`https://graph.facebook.com/v20.0/${videoId}`, {
    method: 'GET',
    label: 'check-video-source',
    query: { access_token: token, fields: 'id,source,permalink_url,status' },
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
