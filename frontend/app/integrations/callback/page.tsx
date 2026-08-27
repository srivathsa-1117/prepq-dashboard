'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useCompleteOAuthConnect } from '@/lib/hooks/useIntegrations';
import { ApiError } from '@/lib/api/client';

/**
 * Technical OAuth callback route (spec §17 allows /login and OAuth callbacks
 * outside the three product pages) - Meta/Google redirect the full browser
 * tab here with ?code&state after the consent screen. Exchanges them via the
 * backend (which decodes clientId/provider from the signed state) and sends
 * the user back into the app. Not part of the sidebar nav.
 */
function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const complete = useCompleteOAuthConnect();
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [message, setMessage] = useState<string | null>(null);
  const [connectedProvider, setConnectedProvider] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const oauthError = searchParams.get('error_description') ?? searchParams.get('error');
    if (oauthError) {
      setStatus('error');
      setMessage(oauthError);
      return;
    }

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    if (!code || !state) {
      setStatus('error');
      setMessage('Missing authorization code from the provider.');
      return;
    }

    complete.mutate(
      { code, state },
      {
        onSuccess: (result) => {
          setConnectedProvider(result.provider);
          setStatus('success');
        },
        onError: (err) => {
          setStatus('error');
          setMessage(err instanceof ApiError ? err.message : 'Failed to complete the connection.');
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status === 'success') {
      // Hands off to AppShell, which reopens the Integrations drawer on the right tab (?connected=<provider>) - see AppShell.tsx.
      const timeout = setTimeout(() => router.replace(`/overview?connected=${connectedProvider ?? ''}`), 1200);
      return () => clearTimeout(timeout);
    }
  }, [status, connectedProvider, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        {status === 'pending' && (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-foreground">Finishing connection…</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle2 className="h-6 w-6 text-good" />
            <p className="text-sm text-foreground">Connected. Redirecting…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="h-6 w-6 text-critical" />
            <p className="text-sm text-foreground">Couldn&apos;t complete the connection</p>
            {message && <p className="text-xs text-muted-foreground">{message}</p>}
            <button onClick={() => router.replace('/overview')} className="mt-1 text-xs text-primary underline">
              Back to dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function IntegrationOAuthCallbackPage() {
  return (
    <Suspense>
      <CallbackContent />
    </Suspense>
  );
}
