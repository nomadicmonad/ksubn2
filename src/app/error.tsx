'use client';

import { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg-base)' }}>
      <div className="text-center space-y-4 max-w-sm">
        <AlertCircle size={48} className="mx-auto" style={{ color: 'var(--color-danger)' }} />
        <h2 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Something went wrong</h2>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {error.message || 'An unexpected error occurred.'}
        </p>
        <button onClick={reset} className="btn-primary mx-auto">Try again</button>
      </div>
    </div>
  );
}
