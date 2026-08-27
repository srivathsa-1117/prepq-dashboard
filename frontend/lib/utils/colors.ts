/**
 * CSS custom properties work directly as SVG fill/stroke values in every
 * evergreen browser, so chart colors can reference `var(--x)` strings
 * directly (Recharts renders them straight through) - no need to read
 * computed styles at render time like the vanilla-JS reference dashboard did.
 */
export const chartColor = {
  cpa: 'var(--cpa)',
  ea: 'var(--ea)',
  meta: 'var(--meta)',
  google: 'var(--google)',
  good: 'var(--good)',
  goodText: 'var(--good-text)',
  warning: 'var(--warning)',
  serious: 'var(--serious)',
  critical: 'var(--critical)',
  baseline: 'var(--baseline)',
  grid: 'var(--grid)',
  muted: 'var(--muted)',
  primary: 'var(--primary)',
  chip: 'var(--chip)',
  funnel: ['var(--f1)', 'var(--f2)', 'var(--f3)', 'var(--f4)', 'var(--f5)', 'var(--f6)'] as const,
  sequential: ['var(--seq1)', 'var(--seq2)', 'var(--seq3)', 'var(--seq4)', 'var(--seq5)', 'var(--seq6)', 'var(--seq7)'] as const,
} as const;

export function courseColor(courseCode: string | null | undefined): string {
  if (courseCode === 'CPA') return chartColor.cpa;
  if (courseCode === 'EA') return chartColor.ea;
  return chartColor.baseline;
}

export function platformColor(platform: string | null | undefined): string {
  if (platform === 'meta') return chartColor.meta;
  if (platform === 'google') return chartColor.google;
  return chartColor.baseline;
}

export function sequentialColorForRatio(ratio: number): string {
  const idx = Math.min(6, Math.max(0, Math.floor(ratio * 6.999)));
  return chartColor.sequential[idx] ?? chartColor.sequential[0];
}
