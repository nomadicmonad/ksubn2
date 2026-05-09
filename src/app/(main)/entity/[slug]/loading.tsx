export default function Loading() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Header skeleton */}
      <div className="card p-6 sm:p-8">
        <div className="flex gap-6">
          <div className="w-28 h-28 rounded-2xl flex-shrink-0" style={{ background: 'var(--color-bg-hover)' }} />
          <div className="flex-1 space-y-3">
            <div className="h-4 w-24 rounded" style={{ background: 'var(--color-bg-hover)' }} />
            <div className="h-8 w-64 rounded" style={{ background: 'var(--color-bg-hover)' }} />
            <div className="h-4 w-full rounded" style={{ background: 'var(--color-bg-hover)' }} />
            <div className="h-4 w-3/4 rounded" style={{ background: 'var(--color-bg-hover)' }} />
          </div>
        </div>
      </div>
      {/* Claims skeleton */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card p-4 h-24" style={{ background: 'var(--color-bg-card)' }} />
          ))}
        </div>
        <div className="space-y-4">
          <div className="card p-4 h-40" style={{ background: 'var(--color-bg-card)' }} />
        </div>
      </div>
    </div>
  );
}
