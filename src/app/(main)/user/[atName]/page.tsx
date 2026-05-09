import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { EntityCard } from '@/components/entity/EntityCard';
import type { Entity, Profile } from '@/types';
import { CalendarDays, Link2 } from 'lucide-react';

interface Props { params: Promise<{ atName: string }> }

export default async function UserProfilePage({ params }: Props) {
  const { atName } = await params;
  const decoded = decodeURIComponent(atName);
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('at_name', decoded)
    .single();

  if (!profile) notFound();
  const p = profile as Profile;

  // Get their recent submissions
  const { data: claims } = await supabase
    .from('claims')
    .select(`
      id, relation_type, description, source_domain, created_at,
      from_entity:entities!claims_from_entity_fkey(id, name, slug, type),
      to_entity:entities!claims_to_entity_fkey(id, name, slug, type)
    `)
    .eq('created_by', p.id)
    .eq('is_public', true)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(20);

  // Starred entities
  const { data: stars } = await supabase
    .from('stars')
    .select('entities(*)')
    .eq('user_id', p.id)
    .not('entity_id', 'is', null)
    .limit(6);

  const starredEntities = (stars ?? []).map((s: any) => s.entities).filter(Boolean) as Entity[];

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
      {/* Profile header */}
      <div className="card p-6 flex gap-5">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold flex-shrink-0"
          style={{ background: 'rgba(99,102,241,0.2)', color: 'var(--color-accent)' }}
        >
          {p.display_name?.[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            {p.display_name}
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{p.at_name}</p>
          {p.bio && <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{p.bio}</p>}
          <div className="flex gap-4 mt-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <span className="flex items-center gap-1"><Link2 size={11} /> {p.claims_total} connections submitted</span>
            <span className="flex items-center gap-1"><CalendarDays size={11} /> Joined {new Date(p.created_at).getFullYear()}</span>
          </div>
        </div>
      </div>

      {/* Starred entities */}
      {starredEntities.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>Starred entities</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {starredEntities.map(e => <EntityCard key={e.id} entity={e} compact />)}
          </div>
        </section>
      )}

      {/* Recent submissions */}
      <section>
        <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
          Recent submissions <span className="text-sm font-normal" style={{ color: 'var(--color-text-muted)' }}>({(claims ?? []).length})</span>
        </h2>
        {(claims ?? []).length === 0 ? (
          <div className="card p-8 text-center">
            <p style={{ color: 'var(--color-text-muted)' }}>No public submissions yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(claims ?? []).map((c: any) => (
              <div key={c.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Link href={`/entity/${c.from_entity.slug}`} style={{ color: 'var(--color-accent)' }} className="hover:underline font-medium">
                    {c.from_entity.name}
                  </Link>
                  <span style={{ color: 'var(--color-text-muted)' }}>→</span>
                  <Link href={`/entity/${c.to_entity.slug}`} style={{ color: 'var(--color-accent)' }} className="hover:underline font-medium">
                    {c.to_entity.name}
                  </Link>
                </div>
                <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--color-text-secondary)' }}>{c.description}</p>
                <div className="flex items-center gap-3 mt-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {c.source_domain && <span>{c.source_domain}</span>}
                  <span>{new Date(c.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export async function generateMetadata({ params }: Props) {
  const { atName } = await params;
  return { title: decodeURIComponent(atName) };
}
