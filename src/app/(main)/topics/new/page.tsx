'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Globe, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function NewTopicPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError('');

    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { router.push('/login?next=/topics/new'); return; }
    const { data: profile } = await sb.from('profiles').select('is_banned').eq('id', user.id).single();
    if (profile?.is_banned) {
      setError('Your account is currently restricted and cannot create new topics.');
      setLoading(false);
      return;
    }

    const { data, error: err } = await sb
      .from('topics')
      .insert({ user_id: user.id, title: title.trim(), description: description.trim() || null, is_public: isPublic })
      .select('id')
      .single();

    if (err) { setError(err.message); setLoading(false); return; }
    router.push(`/topics/${data.id}`);
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>New topic</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Create a curated collection of connections you can share.
        </p>
      </div>

      <form onSubmit={handleCreate} className="card p-6 space-y-5">
        {error && (
          <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-danger)', border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>Title *</label>
          <input
            className="input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Epstein Network"
            maxLength={100}
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>Description</label>
          <textarea
            className="input resize-none"
            style={{ minHeight: 80 }}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What is this topic about?"
            maxLength={500}
          />
        </div>

        {/* Visibility toggle */}
        <div
          className="flex items-center justify-between p-4 rounded-xl cursor-pointer transition-colors"
          style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-bg-border)' }}
          onClick={() => setIsPublic(v => !v)}
        >
          <div className="flex items-center gap-3">
            {isPublic
              ? <Globe size={18} style={{ color: 'var(--color-success)' }} />
              : <Lock size={18} style={{ color: 'var(--color-text-muted)' }} />
            }
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                {isPublic ? 'Public' : 'Private'}
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {isPublic ? 'Anyone can view and embed this topic' : 'Only you can see this topic'}
              </p>
            </div>
          </div>
          <div
            className="w-10 h-6 rounded-full transition-colors relative flex-shrink-0"
            style={{ background: isPublic ? 'var(--color-accent)' : 'var(--color-bg-border)' }}
          >
            <div
              className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
              style={{ left: isPublic ? '22px' : '4px' }}
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={loading || !title.trim()} className="btn-primary flex-1 justify-center">
            {loading ? 'Creating…' : 'Create topic'}
          </button>
          <button type="button" onClick={() => router.back()} className="btn-outline">Cancel</button>
        </div>
      </form>
    </div>
  );
}
