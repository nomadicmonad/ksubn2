import { Suspense } from 'react';
import { GraphView } from '@/components/graph/GraphView';

export const metadata = { title: 'Graph Explorer' };

export default function GraphPage() {
  return (
    <div className="-mx-4 sm:-mx-6 -my-6">
      <Suspense fallback={
        <div className="h-[calc(100vh-56px)] flex items-center justify-center" style={{ background: 'var(--color-bg-base)' }}>
          <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading graph…</div>
        </div>
      }>
        <GraphView />
      </Suspense>
    </div>
  );
}
