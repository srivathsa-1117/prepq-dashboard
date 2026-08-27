'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Megaphone, Palette } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [{ href: '/overview', label: 'Overview', icon: LayoutDashboard }],
  },
  {
    label: 'Performance',
    items: [
      { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
      { href: '/creatives', label: 'Creatives', icon: Palette },
    ],
  },
] as const;

/** Exactly three product pages per spec §2 - Overview, Campaigns, Creatives. No other main nav entries belong here. */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">P</div>
        <span className="text-sm font-semibold text-foreground">PrepQ</span>
      </div>
      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="flex flex-col gap-1">
            <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{section.label}</span>
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
                    active ? 'bg-chip text-foreground' : 'text-muted-foreground hover:bg-chip/60 hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
