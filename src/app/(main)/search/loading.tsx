export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 rounded animate-pulse" style={{ background: 'var(--color-bg-card)' }} />
      <div className="flex gap-3">
        <div className="flex-1 h-10 rounded-lg animate-pulse" style={{ background: 'var(--color-bg-card)' }} />
        <div className="w-32 h-10 rounded-lg animate-pulse" style={{ background: 'var(--color-bg-card)' }} />
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="card h-24 animate-pulse" style={{ background: 'var(--color-bg-card)' }} />
        ))}
      </div>
    </div>
  );
}
