'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Suspense } from 'react';

function CallbackHandler() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false); // prevent double-fire in React Strict Mode

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    const code = searchParams.get('code');
    const next = searchParams.get('next') ?? '/';
    const safePath = next.startsWith('/') && !next.startsWith('//') ? next : '/';

    if (!code) {
      window.location.replace('/login?error=auth_failed');
      return;
    }

    createClient()
      .auth.exchangeCodeForSession(code)
      .then(({ error }) => {
        if (error) {
          setError(error.message);
          setTimeout(() => window.location.replace('/login?error=auth_failed'), 2000);
        } else {
          // Hard navigate so the server sees the freshly written session cookies
          window.location.replace(safePath);
        }
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-base)' }}>
        <p className="text-sm" style={{ color: 'var(--color-danger)' }}>Sign-in error — redirecting…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-base)' }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Signing you in…</p>
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-base)' }}>
        <div className="w-6 h-6 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  );
}
