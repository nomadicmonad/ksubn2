'use client';

import { useState, useTransition } from 'react';
import { Star } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface StarButtonProps {
  entityId: string;
  initialStarred: boolean;
  size?: 'sm' | 'md';
}

export function StarButton({ entityId, initialStarred, size = 'md' }: StarButtonProps) {
  const [starred, setStarred] = useState(initialStarred);
  const [pending, startTransition] = useTransition();

  async function toggle() {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.location.href = '/login'; return; }

    const next = !starred;
    setStarred(next);

    startTransition(async () => {
      if (next) {
        await sb.from('stars').upsert({ user_id: user.id, entity_id: entityId }, { onConflict: 'user_id,entity_id' });
      } else {
        await sb.from('stars').delete().match({ user_id: user.id, entity_id: entityId });
      }
    });
  }

  const iconSize = size === 'sm' ? 14 : 18;
  const px = size === 'sm' ? 'px-2 py-1' : 'px-3 py-2';

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className={`inline-flex items-center gap-1.5 ${px} rounded-lg text-sm font-medium transition-all duration-150`}
      style={{
        background: starred ? 'rgba(245,158,11,0.15)' : 'var(--color-bg-hover)',
        border: starred ? '1px solid rgba(245,158,11,0.35)' : '1px solid var(--color-bg-border)',
        color: starred ? 'var(--color-warning)' : 'var(--color-text-secondary)',
        transform: pending ? 'scale(0.95)' : 'scale(1)',
      }}
      title={starred ? 'Unstar' : 'Star'}
    >
      <Star
        size={iconSize}
        fill={starred ? 'currentColor' : 'none'}
        style={{ transition: 'fill 0.15s' }}
      />
      {size === 'md' && (starred ? 'Starred' : 'Star')}
    </button>
  );
}
