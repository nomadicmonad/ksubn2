'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Network } from 'lucide-react';

export default function LoginPage() {
  const params = useSearchParams();
  const next = params.get('next') ?? '/';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function signInWithGoogle() {
    setLoading(true);
    setError('');
    const sb = createClient();
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    if (error) { setError(error.message); setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg-base)' }}>
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-bold mx-auto"
            style={{ background: 'var(--color-accent-dim)', color: 'var(--color-accent)', border: '1px solid rgba(99,102,241,0.3)' }}
          >
            K<sub style={{ fontSize: '0.7em', color: 'var(--color-kpurple)' }}>n</sub>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Sign in to ksubn</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Map the hidden connections.
          </p>
        </div>

        <div className="card p-6 space-y-4">
          {error && (
            <div
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-danger)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              {error}
            </div>
          )}

          <button
            onClick={signInWithGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-xl font-medium text-sm transition-all"
            style={{
              background: 'white',
              color: '#1a1a1a',
              border: '1px solid #e0e0e0',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
            ) : (
              <GoogleIcon />
            )}
            {loading ? 'Redirecting…' : 'Continue with Google'}
          </button>

          <p className="text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
            By signing in you agree to our{' '}
            <a href="/terms" style={{ color: 'var(--color-accent)' }}>terms</a> and{' '}
            <a href="/privacy" style={{ color: 'var(--color-accent)' }}>privacy policy</a>.
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  );
}
