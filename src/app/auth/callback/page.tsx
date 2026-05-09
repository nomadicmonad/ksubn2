'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Suspense } from 'react';

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const next = searchParams.get('next') ?? '/';

    if (!code) {
      router.replace('/login?error=auth_failed');
      return;
    }

    (async () => {
      const sb = createClient();
      // Client-side exchange — has access to the PKCE verifier in local storage/cookies
      const { error } = await sb.auth.exchangeCodeForSession(code);
      if (error) {
        setError(error.message);
        setTimeout(() => router.replace('/login?error=auth_failed'), 2000);
        return;
      }

      // Check onboarding
      const { data: { user } } = await sb.auth.getUser();
      if (user) {
        const { data: profile } = await sb
          .from('profiles')
          .select('onboarding_completed, display_name')
          .eq('id', user.id)
          .maybeSingle();
        const done = profile?.onboarding_completed || Boolean(profile?.display_name);
        if (!done) {
          router.replace(`/onboarding?next=${encodeURIComponent(next)}`);
          return;
        }
      }

      const safePath = next.startsWith('/') && !next.startsWith('//') ? next : '/';
      router.replace(safePath);
    })();
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-base)' }}>
        <p className="text-sm" style={{ color: 'var(--color-danger)' }}>Auth error: {error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-base)' }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Signing you in…</p>
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-base)' }}>
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  );
}
