import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Star } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { EntityCard } from '@/components/entity/EntityCard';
import type { Entity } from '@/types';

export const metadata = { title: 'My Stars' };

export default async function MyStarsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/my/stars');

  const { data: stars } = await supabase
    .from('stars')
    .select('entity_id, entities(*)')
    .eq('user_id', user.id)
    .not('entity_id', 'is', null)
    .order('created_at', { ascending: false });

  const entities = (stars ?? []).map((s: any) => s.entities).filter(Boolean) as Entity[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
          <Star size={22} style={{ color: 'var(--color-warning)' }} />
          My Stars
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Entities you've starred for quick access.
        </p>
      </div>

      {entities.length === 0 ? (
        <div className="card p-12 text-center">
          <Star size={40} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--color-text-muted)' }} />
          <p style={{ color: 'var(--color-text-muted)' }}>No starred entities yet.</p>
          <Link href="/search" className="btn-primary mt-4 inline-flex">Browse entities</Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {entities.map(entity => <EntityCard key={entity.id} entity={entity} />)}
        </div>
      )}
    </div>
  );
}
