import { httpJson } from '../src/utils/httpClient.js';

async function main() {
  const token = process.env.META_SYSTEM_USER_ACCESS_TOKEN;
  if (!token) throw new Error('no token');

  const videoIds = ['3013397325497140', '2317362159002544'];

  const response = await httpJson<any>(`https://graph.facebook.com/v20.0/`, {
    method: 'GET',
    label: 'check-video-source-2',
    query: { access_token: token, ids: videoIds.join(','), fields: 'id,source,permalink_url' },
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
