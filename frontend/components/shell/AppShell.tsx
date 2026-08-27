'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { IntegrationsDrawer } from './IntegrationsDrawer';
import type { IntegrationProvider } from '@/lib/types/api';

/** Reopens the Integrations drawer on the right tab after app/integrations/callback redirects back with ?connected=<provider>, then strips the param so refreshing doesn't reopen it. */
function OAuthReturnWatcher({ onReturn }: { onReturn: (provider: IntegrationProvider) => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const connected = searchParams.get('connected');
    if (!connected) return;
    onReturn(connected as IntegrationProvider);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('connected');
    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [defaultProvider, setDefaultProvider] = useState<IntegrationProvider | undefined>(undefined);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Suspense>
        <OAuthReturnWatcher
          onReturn={(provider) => {
            setDefaultProvider(provider);
            setIntegrationsOpen(true);
          }}
        />
      </Suspense>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenIntegrations={() => setIntegrationsOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="container py-6">{children}</div>
        </main>
      </div>
      <IntegrationsDrawer open={integrationsOpen} onOpenChange={setIntegrationsOpen} defaultProvider={defaultProvider} />
    </div>
  );
}
