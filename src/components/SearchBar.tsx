'use client';

export function SearchBar() {
  return (
    <form action="/search" className="relative max-w-xl mx-auto">
      <svg
        className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: 'var(--color-text-muted)' }}
        width={18} height={18} viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      >
        <circle cx={11} cy={11} r={8} /><path d="m21 21-4.35-4.35" />
      </svg>
      <input
        name="q"
        type="text"
        placeholder="Search people, organizations, events…"
        className="w-full pl-11 pr-4 py-3.5 rounded-xl text-sm focus:outline-none transition-all"
        style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-bg-border)',
          color: 'var(--color-text-primary)',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'rgba(99,102,241,0.6)';
          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-bg-border)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      />
      <button
        type="submit"
        className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
        style={{ background: 'var(--color-accent)' }}
      >
        Search
      </button>
    </form>
  );
}
