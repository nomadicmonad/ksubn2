'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function OnboardingPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/';
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) { setError('Name must be at least 2 characters'); return; }
    if (trimmed.length > 30) { setError('Name must be 30 characters or less'); return; }
    if (!/^[a-zA-Z0-9 _-]+$/.test(trimmed)) { setError('Name can only contain letters, numbers, spaces, _ and -'); return; }

    setLoading(true);
    setError('');
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { router.push('/login'); return; }

    // Check uniqueness
    const { data: existing } = await sb.from('profiles').select('id').eq('display_name', trimmed).maybeSingle();
    if (existing) {
      setError('That name is taken — try adding a number');
      setLoading(false);
      return;
    }

    // Generate at_name suffix
    let suffix = 1;
    let atName = `${trimmed}#${suffix}`;
    while (true) {
      const { data: taken } = await sb.from('profiles').select('id').eq('at_name', atName).maybeSingle();
      if (!taken) break;
      suffix++;
      atName = `${trimmed}#${suffix}`;
    }

    const { error: updateError } = await sb.from('profiles').update({ display_name: trimmed, at_name: atName }).eq('id', user.id);
    if (updateError) { setError(updateError.message); setLoading(false); return; }

    router.push(next);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg-base)' }}>
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>Choose your name</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            This is how others will see you on ksubn.
          </p>
        </div>

        <form onSubmit={submit} className="card p-6 space-y-4">
          {error && (
            <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-danger)', border: '1px solid rgba(239,68,68,0.2)' }}>
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
              Display name
            </label>
            <input
              className="input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. ResearchBot"
              maxLength={30}
              autoFocus
            />
            {name.trim() && (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Your handle will be <span style={{ color: 'var(--color-accent)' }}>@{name.trim()}#1</span> (number may vary)
              </p>
            )}
          </div>

          <button type="submit" disabled={loading || name.trim().length < 2} className="btn-primary w-full justify-center">
            {loading ? 'Saving…' : 'Get started'}
          </button>
        </form>
      </div>
    </div>
  );
}
