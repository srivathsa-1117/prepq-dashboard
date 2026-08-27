'use client';

import { useState } from 'react';
import { ImageOff, Play } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

/** Meta's Reels-format ad videos don't expose a raw file at this token's permission level - MetaClient.fetchVideoSources falls back to this embed for real playback via Facebook's own player. */
function isFacebookEmbedUrl(url: string): boolean {
  return url.includes('facebook.com/plugins/video.php');
}

interface AssetPreviewProps {
  url: string | null;
  alt: string;
  className?: string;
  /** Renders a real <video> element (poster only, no autoplay) instead of the lightweight play-badge-over-image treatment. */
  playableVideo?: boolean;
}

/**
 * Renders the actual creative asset - image or video thumbnail with a play
 * indicator, never autoplaying (spec: creative previews are critical, no
 * autoplay everywhere). Falls back to an obvious placeholder when there's
 * no asset yet, which is the normal state for a draft creative.
 */
export function AssetPreview({ url, alt, className, playableVideo = false }: AssetPreviewProps) {
  const [errored, setErrored] = useState(false);
  const video = url ? isVideoUrl(url) : false;
  const facebookEmbed = url ? isFacebookEmbedUrl(url) : false;

  if (!url || errored) {
    return (
      <div className={cn('flex items-center justify-center bg-chip text-muted-foreground', className)}>
        <ImageOff className="h-6 w-6" />
      </div>
    );
  }

  if (facebookEmbed && playableVideo) {
    return (
      <div className={cn('overflow-hidden bg-chip', className)}>
        <iframe src={url} title={alt} className="h-full w-full" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      </div>
    );
  }

  if (video && playableVideo) {
    return (
      <div className={cn('relative overflow-hidden bg-chip', className)}>
        <video src={url} preload="metadata" muted playsInline controls className="h-full w-full object-cover" onError={() => setErrored(true)} />
      </div>
    );
  }

  // Grid-card mode has no thumbnail to fall back to for a Facebook-embed-only asset (the backend
  // keeps thumbnail_url as creativePreviewUrl in this case instead - see reportingService.ts's
  // pickGridPreviewUrl) - this branch is a defensive fallback, not the normal path.
  if (facebookEmbed) {
    return (
      <div className={cn('flex items-center justify-center bg-chip text-muted-foreground', className)}>
        <Play className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className={cn('relative overflow-hidden bg-chip', className)}>
      {video ? (
        <video src={url} preload="metadata" muted playsInline className="h-full w-full object-cover" onError={() => setErrored(true)} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} loading="lazy" className="h-full w-full object-cover" onError={() => setErrored(true)} />
      )}
      {video && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/10">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm">
            <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
          </div>
        </div>
      )}
    </div>
  );
}
