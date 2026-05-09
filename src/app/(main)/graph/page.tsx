'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { GraphView } from '@/components/graph/GraphView';

function GraphWithParams() {
  const params = useSearchParams();
  // Support ?entities=slug1,slug2 and ?focus=slug (entity profile → graph link)
  const entitySlugs = [
    ...(params.get('entities')?.split(',').filter(Boolean) ?? []),
    ...(params.get('focus') ? [params.get('focus')!] : []),
  ];

  return (
    <GraphView
      initialSlugs={entitySlugs.length > 0 ? entitySlugs : undefined}
    />
  );
}

export default function GraphPage() {
  return (
    <div className="-mx-4 sm:-mx-6 -my-6">
      <Suspense fallback={
        <div className="h-[calc(100vh-56px)] flex items-center justify-center" style={{ background: 'var(--color-bg-base)' }}>
          <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading graph…</div>
        </div>
      }>
        <GraphWithParams />
      </Suspense>
    </div>
  );
}
