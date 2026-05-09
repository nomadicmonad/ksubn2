'use client';

import { useState, useEffect } from 'react';
import { Settings, Globe, User, Shield, Ban, CheckCircle2, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/types';
import { extractDomain } from '@/lib/utils';

interface SitePreference {
  id: string;
  domain: string;
  is_blacklisted: boolean;
  is_whitelisted: boolean;
}

interface UserPreference {
  id: string;
  target_user_id: string;
  is_blacklisted: boolean;
  is_whitelisted: boolean;
}

interface SessionInfo {
  email: string | null;
  provider: string;
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savingNumerology, setSavingNumerology] = useState(false);
  const [error, setError] = useState('');
  const [siteInput, setSiteInput] = useState('');
  const [sitePrefs, setSitePrefs] = useState<SitePreference[]>([]);
  const [userInput, setUserInput] = useState('');
  const [userPrefs, setUserPrefs] = useState<UserPreference[]>([]);
  const [atNameToDisplay, setAtNameToDisplay] = useState<Record<string, string>>({});
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);

  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { window.location.href = '/login'; return; }
      const provider = user.app_metadata?.provider ?? user.identities?.[0]?.provider ?? 'google';
      setSessionInfo({ email: user.email ?? null, provider });
      const { data } = await sb.from('profiles').select('*').eq('id', user.id).single();
      if (data) {
        const normalizedProfile = data as Profile & { show_numerology?: boolean };
        setProfile({ ...normalizedProfile, show_numerology: normalizedProfile.show_numerology ?? true });
        setDisplayName(data.display_name ?? '');
        setBio(data.bio ?? '');
      }

      const [{ data: sites }, { data: users }] = await Promise.all([
        sb.from('site_preferences').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        sb.from('user_preferences').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      ]);
      setSitePrefs((sites ?? []) as SitePreference[]);
      setUserPrefs((users ?? []) as UserPreference[]);

      const targetIds = [...new Set((users ?? []).map(u => u.target_user_id))];
      if (targetIds.length > 0) {
        const { data: targets } = await sb.from('profiles').select('id, at_name, display_name').in('id', targetIds);
        const map: Record<string, string> = {};
        for (const t of targets ?? []) map[t.id] = t.display_name ? `${t.display_name} (@${t.at_name})` : `@${t.at_name}`;
        setAtNameToDisplay(map);
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

  async function addBlacklistedDomain() {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const domain = extractDomain(siteInput.trim());
    if (!domain || domain.includes(' ')) return;
    const { error: upsertError } = await sb.from('site_preferences').upsert({
      user_id: user.id,
      domain,
      is_blacklisted: true,
      is_whitelisted: false,
    }, { onConflict: 'user_id,domain' });
    if (upsertError) { setError(upsertError.message); return; }
    const { data } = await sb.from('site_preferences').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    setSitePrefs((data ?? []) as SitePreference[]);
    setSiteInput('');
  }

  async function addWhitelistedDomain() {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const domain = extractDomain(siteInput.trim());
    if (!domain || domain.includes(' ')) return;
    const { error: upsertError } = await sb.from('site_preferences').upsert({
      user_id: user.id,
      domain,
      is_blacklisted: false,
      is_whitelisted: true,
    }, { onConflict: 'user_id,domain' });
    if (upsertError) { setError(upsertError.message); return; }
    const { data } = await sb.from('site_preferences').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    setSitePrefs((data ?? []) as SitePreference[]);
    setSiteInput('');
  }

  async function removeSitePref(id: string) {
    const sb = createClient();
    await sb.from('site_preferences').delete().eq('id', id);
    setSitePrefs(prev => prev.filter(p => p.id !== id));
  }

  async function addUserBlacklist() {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user || !userInput.trim()) return;
    const at = userInput.trim().replace(/^@/, '').toLowerCase();
    const { data: target } = await sb.from('profiles').select('id, at_name, display_name').ilike('at_name', at).maybeSingle();
    if (!target) { setError(`No user found with @${at}`); return; }
    if (target.id === user.id) { setError('You cannot blacklist yourself.'); return; }
    const { error: upsertError } = await sb.from('user_preferences').upsert({
      user_id: user.id,
      target_user_id: target.id,
      is_blacklisted: true,
      is_whitelisted: false,
    }, { onConflict: 'user_id,target_user_id' });
    if (upsertError) { setError(upsertError.message); return; }
    const { data } = await sb.from('user_preferences').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    setUserPrefs((data ?? []) as UserPreference[]);
    setAtNameToDisplay(prev => ({ ...prev, [target.id]: target.display_name ? `${target.display_name} (@${target.at_name})` : `@${target.at_name}` }));
    setUserInput('');
  }

  async function addUserWhitelist() {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user || !userInput.trim()) return;
    const at = userInput.trim().replace(/^@/, '').toLowerCase();
    const { data: target } = await sb.from('profiles').select('id, at_name, display_name').ilike('at_name', at).maybeSingle();
    if (!target) { setError(`No user found with @${at}`); return; }
    if (target.id === user.id) { setError('You cannot whitelist yourself.'); return; }
    const { error: upsertError } = await sb.from('user_preferences').upsert({
      user_id: user.id,
      target_user_id: target.id,
      is_blacklisted: false,
      is_whitelisted: true,
    }, { onConflict: 'user_id,target_user_id' });
    if (upsertError) { setError(upsertError.message); return; }
    const { data } = await sb.from('user_preferences').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    setUserPrefs((data ?? []) as UserPreference[]);
    setAtNameToDisplay(prev => ({ ...prev, [target.id]: target.display_name ? `${target.display_name} (@${target.at_name})` : `@${target.at_name}` }));
    setUserInput('');
  }

  async function removeUserPref(id: string) {
    const sb = createClient();
    await sb.from('user_preferences').delete().eq('id', id);
    setUserPrefs(prev => prev.filter(p => p.id !== id));
  }

  async function toggleNumerology(showNumerology: boolean) {
    if (!profile) return;
    setSavingNumerology(true);
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const { error: updateError } = await sb
      .from('profiles')
      .update({ show_numerology: showNumerology })
      .eq('id', user.id);
    if (updateError) {
      setError(updateError.message);
      setSavingNumerology(false);
      return;
    }
    setProfile({ ...profile, show_numerology: showNumerology });
    setSavingNumerology(false);
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

      {profile.is_banned && (
        <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--color-danger)', border: '1px solid rgba(239,68,68,0.25)' }}>
          This account is currently restricted. Submission and topic creation are disabled.
        </div>
      )}

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
        <div className="grid sm:grid-cols-2 gap-4 mb-4 text-sm">
          <div>
            <p style={{ color: 'var(--color-text-muted)' }} className="text-xs">Signed in as</p>
            <p style={{ color: 'var(--color-text-primary)' }} className="font-medium mt-0.5">{sessionInfo?.email ?? 'Unknown'}</p>
          </div>
          <div>
            <p style={{ color: 'var(--color-text-muted)' }} className="text-xs">Auth provider</p>
            <p style={{ color: 'var(--color-text-primary)' }} className="font-medium mt-0.5 capitalize">{sessionInfo?.provider ?? 'Unknown'}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          {[
            { label: 'Claims submitted', value: profile.claims_total },
            { label: 'Entities added', value: profile.entities_total },
            { label: 'Claims today', value: `${profile.submissions_today}/10` },
            { label: 'Entities today', value: `${profile.entities_today}/5` },
            { label: 'Account tier', value: profile.tier },
            { label: 'Account state', value: profile.is_banned ? 'Restricted' : 'Active' },
            { label: 'Onboarding', value: profile.onboarding_completed ? 'Complete' : 'Pending' },
            { label: 'Member since', value: new Date(profile.created_at).getFullYear() },
          ].map(({ label, value }) => (
            <div key={label}>
              <p style={{ color: 'var(--color-text-muted)' }} className="text-xs">{label}</p>
              <p style={{ color: 'var(--color-text-primary)' }} className="font-medium mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Viewing preferences */}
      <div className="card p-6">
        <h2 className="flex items-center gap-2 font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
          <Settings size={16} /> Viewing preferences
        </h2>
        <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ border: '1px solid var(--color-bg-border)', background: 'var(--color-bg-surface)' }}>
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>Show numerology (gematria/date)</p>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Controls numeric coincidences and similar-value hints in entity and graph views.</p>
          </div>
          <button
            type="button"
            disabled={savingNumerology}
            onClick={() => toggleNumerology(!profile.show_numerology)}
            className="btn-ghost text-xs"
          >
            {savingNumerology ? 'Saving…' : profile.show_numerology ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      {/* Site preferences */}
      <div className="card p-6">
        <h2 className="flex items-center gap-2 font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
          <Globe size={16} /> Source domain preferences
        </h2>
        <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
          Blacklisted domains are hidden from your views and blocked on submit. Whitelisted domains override blacklist.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <input className="input flex-1" value={siteInput} onChange={e => setSiteInput(e.target.value)} placeholder="example.com or full URL" />
          <button type="button" onClick={addBlacklistedDomain} className="btn-ghost"><Ban size={14} /> Blacklist</button>
          <button type="button" onClick={addWhitelistedDomain} className="btn-ghost"><CheckCircle2 size={14} /> Whitelist</button>
        </div>
        <div className="space-y-2">
          {sitePrefs.length === 0 && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No domain preferences set.</p>}
          {sitePrefs.map(pref => (
            <div key={pref.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ border: '1px solid var(--color-bg-border)', background: 'var(--color-bg-surface)' }}>
              <div className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                {pref.domain} <span className="text-xs" style={{ color: pref.is_blacklisted ? 'var(--color-danger)' : 'var(--color-success)' }}>· {pref.is_blacklisted ? 'blacklisted' : 'whitelisted'}</span>
              </div>
              <button type="button" onClick={() => removeSitePref(pref.id)} className="btn-ghost text-xs"><Trash2 size={13} /> Remove</button>
            </div>
          ))}
        </div>
      </div>

      {/* User preferences */}
      <div className="card p-6">
        <h2 className="flex items-center gap-2 font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
          <User size={16} /> User preferences
        </h2>
        <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
          Blacklisted users have their submitted claims hidden for you. Whitelisted users are always shown.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <input className="input flex-1" value={userInput} onChange={e => setUserInput(e.target.value)} placeholder="@handle" />
          <button type="button" onClick={addUserBlacklist} className="btn-ghost"><Ban size={14} /> Blacklist</button>
          <button type="button" onClick={addUserWhitelist} className="btn-ghost"><CheckCircle2 size={14} /> Whitelist</button>
        </div>
        <div className="space-y-2">
          {userPrefs.length === 0 && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No user preferences set.</p>}
          {userPrefs.map(pref => (
            <div key={pref.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ border: '1px solid var(--color-bg-border)', background: 'var(--color-bg-surface)' }}>
              <div className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                {atNameToDisplay[pref.target_user_id] ?? pref.target_user_id}
                <span className="text-xs" style={{ color: pref.is_blacklisted ? 'var(--color-danger)' : 'var(--color-success)' }}>
                  {' '}· {pref.is_blacklisted ? 'blacklisted' : 'whitelisted'}
                </span>
              </div>
              <button type="button" onClick={() => removeUserPref(pref.id)} className="btn-ghost text-xs"><Trash2 size={13} /> Remove</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
