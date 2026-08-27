'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { DateRangePreset } from '../types/api';

export interface DashboardFilterState {
  range: DateRangePreset;
  dateFrom?: string;
  dateTo?: string;
  course?: string;
  source?: string;
  campaign?: string;
  creative?: string;
}

/**
 * Filters live in the URL (not component state or a global store) so a
 * filtered view is shareable/bookmarkable and survives navigation between
 * the three product pages - standard Next.js App Router practice.
 */
export function useDashboardFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters: DashboardFilterState = useMemo(() => {
    const range = (searchParams.get('range') as DateRangePreset | null) ?? '30d';
    return {
      range,
      dateFrom: searchParams.get('date_from') ?? undefined,
      dateTo: searchParams.get('date_to') ?? undefined,
      course: searchParams.get('course') ?? undefined,
      source: searchParams.get('source') ?? undefined,
      campaign: searchParams.get('campaign') ?? undefined,
      creative: searchParams.get('creative') ?? undefined,
    };
  }, [searchParams]);

  const setFilters = useCallback(
    (patch: Partial<DashboardFilterState>) => {
      const params = new URLSearchParams(searchParams.toString());
      const next = { ...filters, ...patch };

      // Custom date range and preset range are mutually exclusive.
      if (patch.range) {
        params.delete('date_from');
        params.delete('date_to');
      } else if (patch.dateFrom || patch.dateTo) {
        params.delete('range');
      }

      const entries: Array<[string, string | undefined]> = [
        ['range', patch.range ? next.range : params.get('range') ?? undefined],
        ['date_from', next.dateFrom],
        ['date_to', next.dateTo],
        ['course', next.course],
        ['source', next.source],
        ['campaign', next.campaign],
        ['creative', next.creative],
      ];
      for (const [key, value] of entries) {
        if (value) params.set(key, value);
        else params.delete(key);
      }

      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [filters, pathname, router, searchParams],
  );

  return { filters, setFilters };
}
