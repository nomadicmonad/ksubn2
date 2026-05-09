import Link from 'next/link';
import { Search } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg-base)' }}>
      <div className="text-center space-y-5 max-w-sm">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl font-bold mx-auto"
          style={{ background: 'var(--color-accent-dim)', color: 'var(--color-accent)', border: '1px solid rgba(99,102,241,0.3)' }}
        >
          404
        </div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          Nothing found here
        </h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          This entity, page, or connection doesn't exist — or it's not public.
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/" className="btn-primary">Go home</Link>
          <Link href="/search" className="btn-outline">
            <Search size={14} /> Search
          </Link>
        </div>
      </div>
    </div>
  );
}
