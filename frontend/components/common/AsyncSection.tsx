import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';

interface AsyncSectionProps<T> {
  isLoading: boolean;
  isError: boolean;
  data: T | undefined;
  onRetry?: () => void;
  isEmpty?: (data: T) => boolean;
  emptyMessage?: string;
  skeleton?: ReactNode;
  children: (data: T) => ReactNode;
}

/**
 * Every dashboard widget needs the same four states (loading/error/empty/data)
 * driven off a react-query result - centralizing it here keeps ~20 widgets
 * from re-implementing the same branch every time.
 */
export function AsyncSection<T>({ isLoading, isError, data, onRetry, isEmpty, emptyMessage, skeleton, children }: AsyncSectionProps<T>) {
  if (isLoading) return <>{skeleton ?? <Skeleton className="h-40 w-full" />}</>;
  if (isError) return <ErrorState onRetry={onRetry} />;
  if (data === undefined || (isEmpty ? isEmpty(data) : false)) return <EmptyState message={emptyMessage} />;
  return <>{children(data)}</>;
}
