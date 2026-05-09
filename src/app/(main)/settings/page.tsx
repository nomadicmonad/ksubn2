'use client';

import { useState, useEffect } from 'react';
import { redirect } from 'next/navigation';
import { Settings, Globe, User, Shield } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/types';

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { window.location.href = '/login'; return; }
      const { data } = await sb.from('profiles').select('*').eq('id', user.id).single();
      if (data) {
        setProfile(data as Profile);
        setDisplayName(data.display_name ?? '');
        setBio(data.bio ?? '');
      }
    })();
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    const { error: err } = await sb.from('profiles').update({ display_name: displayName.trim(), bio: bio.trim() }).eq('id', user.id);
    if (err) { setError(err.message); } else { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    setSaving(false);
  }

  if (!profile) return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="card p-8 animate-pulse" style={{ height: '200px' }} />
    </div>
  );

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
        <Settings size={22} style={{ color: 'var(--color-accent)' }} /> Settings
      </h1>

      {/* Profile */}
      <div className="card p-6">
        <h2 className="flex items-center gap-2 font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
          <User size={16} /> Profile
        </h2>
        <form onSubmit={saveProfile} className="space-y-4">
          {error && <div className="text-sm rounded-lg px-3 py-2" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-danger)' }}>{error}</div>}

          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>Display name</label>
            <input className="input" value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={30} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>Bio</label>
            <textarea className="input resize-none" style={{ minHeight: 80 }} value={bio} onChange={e => setBio(e.target.value)} maxLength={200} placeholder="A short bio…" />
          </div>

          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : saved ? '✓ Saved' : 'Save changes'}</button>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Handle: {profile.at_name}</span>
          </div>
        </form>
      </div>

      {/* Account stats */}
      <div className="card p-6">
        <h2 className="flex items-center gap-2 font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
          <Shield size={16} /> Account
        </h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          {[
            { label: 'Claims submitted', value: profile.claims_total },
            { label: 'Entities added', value: profile.entities_total },
            { label: 'Claims today', value: `${profile.submissions_today}/10` },
            { label: 'Entities today', value: `${profile.entities_today}/5` },
            { label: 'Account tier', value: profile.tier },
            { label: 'Member since', value: new Date(profile.created_at).getFullYear() },
          ].map(({ label, value }) => (
            <div key={label}>
              <p style={{ color: 'var(--color-text-muted)' }} className="text-xs">{label}</p>
              <p style={{ color: 'var(--color-text-primary)' }} className="font-medium mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
