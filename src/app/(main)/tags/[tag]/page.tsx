import { createClient } from '@/lib/supabase/server';
import { EntityCard } from '@/components/entity/EntityCard';
import { Tag } from 'lucide-react';
import type { Entity } from '@/types';

interface Props { params: Promise<{ tag: string }> }

export default async function TagPage({ params }: Props) {
  const { tag } = await params;
  const decoded = decodeURIComponent(tag);
  const supabase = await createClient();

  const { data } = await supabase
    .from('entities')
    .select('*')
    .eq('is_public', true)
    .contains('tags', [decoded])
    .order('direct_claim_count', { ascending: false })
    .limit(48);

  const entities = (data ?? []) as Entity[];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--color-accent)' }}>
          <Tag size={18} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{decoded}</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {entities.length} entit{entities.length === 1 ? 'y' : 'ies'} tagged
          </p>
        </div>
      </div>

      {entities.length === 0 ? (
        <div className="card p-12 text-center">
          <p style={{ color: 'var(--color-text-muted)' }}>No entities with this tag yet.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {entities.map(entity => <EntityCard key={entity.id} entity={entity} />)}
        </div>
      )}
    </div>
  );
}

export async function generateMetadata({ params }: Props) {
  const { tag } = await params;
  return { title: `#${decodeURIComponent(tag)} — ksubn` };
}
