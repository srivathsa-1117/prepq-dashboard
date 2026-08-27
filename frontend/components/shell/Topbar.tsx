'use client';

import { MobileNav } from './MobileNav';
import { ClientSwitcher } from './ClientSwitcher';
import { SyncStatus } from './SyncStatus';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

export function Topbar({ onOpenIntegrations }: { onOpenIntegrations: () => void }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4">
      <div className="flex items-center gap-2">
        <MobileNav />
        <ClientSwitcher />
      </div>
      <div className="flex items-center gap-3">
        <SyncStatus />
        <ThemeToggle />
        <UserMenu onOpenIntegrations={onOpenIntegrations} />
      </div>
    </header>
  );
}
