/** Maps the creatives.status DB values (draft/ready/active/paused/archived) to the spec's Draft/Ready/Live/Paused/Archived vocabulary - 'active' is the underlying value for a launched/live creative. */
const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  ready: 'Ready',
  active: 'Live',
  paused: 'Paused',
  archived: 'Archived',
};

const STATUS_VARIANT: Record<string, 'good' | 'warning' | 'bad' | 'default'> = {
  draft: 'default',
  ready: 'warning',
  active: 'good',
  paused: 'warning',
  archived: 'default',
};

export function creativeStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Unknown';
  return STATUS_LABEL[status] ?? status;
}

export function creativeStatusVariant(status: string | null | undefined): 'good' | 'warning' | 'bad' | 'default' {
  if (!status) return 'default';
  return STATUS_VARIANT[status] ?? 'default';
}
