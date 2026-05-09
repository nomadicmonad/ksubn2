'use client';

import { useEffect } from 'react';

// If Supabase sends the OAuth code to the wrong URL (because the
// redirect URL isn't whitelisted), intercept it here and forward to
// the real callback handler.
export function AuthCodeInterceptor() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code && !window.location.pathname.startsWith('/auth/callback')) {
      const next = params.get('next') ?? '/';
      window.location.replace(
        `/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`
      );
    }
  }, []);

  return null;
}
