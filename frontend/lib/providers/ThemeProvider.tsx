'use client';

import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from 'next-themes';

/**
 * Uses attribute="data-theme" (not next-themes' default "class") because
 * the palette translated from prepq-dashboard-v2.html keys off
 * `:root[data-theme="dark"]` / `[data-theme="light"]`, with a
 * `prefers-color-scheme` media query fallback for "system" - see
 * app/globals.css. Preserves the original file's exact theming mechanism.
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider attribute="data-theme" defaultTheme="system" enableSystem {...props}>
      {children}
    </NextThemesProvider>
  );
}
