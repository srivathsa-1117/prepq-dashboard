import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/lib/providers/ThemeProvider';
import { QueryProvider } from '@/lib/providers/QueryProvider';
import { AuthProvider } from '@/lib/providers/AuthProvider';
import { OrgClientProvider } from '@/lib/providers/OrgClientProvider';
import { TooltipProvider } from '@/components/ui/tooltip';

export const metadata: Metadata = {
  title: 'PrepQ Analytics',
  description: 'Marketing and sales analytics for PrepQ',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>
              <OrgClientProvider>
                <TooltipProvider>{children}</TooltipProvider>
              </OrgClientProvider>
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
