'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { LeadTimeline } from '@/components/leads/LeadTimeline';

export default function LeadDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href="/overview" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to overview
        </Link>
      </div>

      <LeadTimeline leadId={params.id} />
    </div>
  );
}
