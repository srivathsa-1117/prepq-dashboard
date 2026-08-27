/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Dev-server-only: the OAuth connect flow (spec) sends the browser away to Meta/Google's
  // consent screen for a minute or more. Next's default on-demand-entries GC (25s inactivity,
  // 5-page buffer) evicts compiled pages during that window, so the returning /integrations/callback
  // hit sometimes fails with "ChunkLoadError: Loading chunk app/layout failed" before it can even
  // call the backend. Longer buffer/timeout avoids that; irrelevant to production builds.
  onDemandEntries: {
    maxInactiveAge: 15 * 60 * 1000,
    pagesBufferLength: 10,
  },
  images: {
    // Creative asset previews come from wherever the ad platforms / this
    // org's asset storage host them - remotePatterns is deliberately broad
    // rather than an allowlist of specific CDNs, since clients can connect
    // arbitrary Meta/Google accounts. Tighten this once real asset hosts
    // are known (see AssetPreview.tsx TODO).
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default nextConfig;
