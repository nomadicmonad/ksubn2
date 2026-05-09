'use client';

import { useState, useTransition } from 'react';
import { Star } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type StarKind = 'entity' | 'claim' | 'topic';

interface StarToggleButtonProps {
  kind: StarKind;
  targetId: string;
  initialStarred: boolean;
  size?: 'sm' | 'md';
  label?: boolean;
}

export function StarToggleButton({
  kind,
  targetId,
  initialStarred,
  size = 'md',
  label = true,
}: StarToggleButtonProps) {
  const [starred, setStarred] = useState(initialStarred);
  const [pending, startTransition] = useTransition();

  async function toggle() {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.location.href = '/login'; return; }

    const next = !starred;
    setStarred(next);

    startTransition(async () => {
      if (kind === 'entity') {
        const payload = { user_id: user.id, entity_id: targetId };
        if (next) await sb.from('stars').upsert(payload, { onConflict: 'user_id,entity_id' });
        else await sb.from('stars').delete().match(payload);
        return;
      }
      if (kind === 'claim') {
        const payload = { user_id: user.id, claim_id: targetId };
        if (next) await sb.from('stars').upsert(payload, { onConflict: 'user_id,claim_id' });
        else await sb.from('stars').delete().match(payload);
        return;
      }
      const payload = { user_id: user.id, topic_id: targetId };
      if (next) await sb.from('stars').upsert(payload, { onConflict: 'user_id,topic_id' });
      else await sb.from('stars').delete().match(payload);
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
      {label && size === 'md' && (starred ? 'Starred' : 'Star')}
    </button>
  );
}
