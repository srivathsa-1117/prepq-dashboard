/**
 * Formatting helpers ported directly from prepq-dashboard-v2.html's
 * fmt/pct/inr/inrL/dur functions - same rounding, same locale, same
 * "L for lakh" convention for large rupee amounts.
 */

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-IN');
}

export function formatPercent(fraction: number | null | undefined, digits = 0): string {
  if (fraction === null || fraction === undefined || Number.isNaN(fraction)) return '—';
  return (fraction * 100).toFixed(digits) + '%';
}

export function formatRatio(numerator: number, denominator: number): string {
  if (!denominator) return '—';
  return Math.round((numerator / denominator) * 100) + '%';
}

export function formatCurrency(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

/** ₹1.2L for amounts >= 1,00,000, otherwise plain rupees - matches the reference dashboard's inrL(). */
export function formatCurrencyCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (n >= 100_000) return '₹' + (n / 100_000).toFixed(1) + 'L';
  return formatCurrency(n);
}

/** Duration in hours -> "42m" (< 1h) or "3.2h" - matches the reference dashboard's dur(). */
export function formatDuration(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || Number.isNaN(hours)) return '—';
  if (hours < 1) return Math.round(hours * 60) + 'm';
  return hours.toFixed(1) + 'h';
}

export function formatMultiplier(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toFixed(digits) + '×';
}

export function formatDeltaPct(deltaPct: number | null): { text: string; positive: boolean } {
  if (deltaPct === null) return { text: 'flat vs. previous period', positive: true };
  const pct = Math.round(Math.abs(deltaPct) * 100);
  const positive = deltaPct >= 0;
  return { text: `${positive ? '▲' : '▼'} ${pct}%`, positive };
}

export function formatDateLabel(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function formatDateTime(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  });
}
