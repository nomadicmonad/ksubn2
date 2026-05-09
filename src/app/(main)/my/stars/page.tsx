import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Star, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { EntityCard } from '@/components/entity/EntityCard';
import type { Claim, Entity, Topic } from '@/types';
import { RELATION_META } from '@/types';

export const metadata = { title: 'My Stars' };

export default async function MyStarsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/my/stars');

  const { data: stars } = await supabase
    .from('stars')
    .select('entity_id, claim_id, topic_id, entities(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const entities = (stars ?? []).map((s: any) => s.entities).filter(Boolean) as Entity[];
  const claimIds = (stars ?? []).map((s: any) => s.claim_id).filter(Boolean) as string[];
  const topicIds = (stars ?? []).map((s: any) => s.topic_id).filter(Boolean) as string[];

  const [{ data: claimsData }, { data: topicsData }] = await Promise.all([
    claimIds.length
      ? supabase.from('claims').select('id, from_entity, to_entity, relation_type, description, source_domain, source_url').in('id', claimIds)
      : Promise.resolve({ data: [] as any[] }),
    topicIds.length
      ? supabase.from('topics').select('*').in('id', topicIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const claims = (claimsData ?? []) as Pick<Claim, 'id' | 'from_entity' | 'to_entity' | 'relation_type' | 'description' | 'source_domain' | 'source_url'>[];
  const topics = (topicsData ?? []) as Topic[];
  const entityIdsForClaims = [...new Set(claims.flatMap(c => [c.from_entity, c.to_entity]))];
  const { data: claimEntitiesData } = entityIdsForClaims.length
    ? await supabase.from('entities').select('id, name, slug').in('id', entityIdsForClaims)
    : { data: [] as any[] };
  const claimEntityMap = new Map((claimEntitiesData ?? []).map((e: any) => [e.id, e]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
          <Star size={22} style={{ color: 'var(--color-warning)' }} />
          My Stars
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>Entities, claims, and topics you've starred.</p>
      </div>

      {entities.length === 0 && claims.length === 0 && topics.length === 0 ? (
        <div className="card p-12 text-center">
          <Star size={40} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--color-text-muted)' }} />
          <p style={{ color: 'var(--color-text-muted)' }}>No starred items yet.</p>
          <Link href="/search" className="btn-primary mt-4 inline-flex">Browse entities</Link>
        </div>
      ) : (
        <div className="space-y-8">
          {entities.length > 0 && (
            <section className="space-y-3">
              <h2 className="section-title">Starred entities</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {entities.map(entity => <EntityCard key={entity.id} entity={entity} />)}
              </div>
            </section>
          )}

          {claims.length > 0 && (
            <section className="space-y-3">
              <h2 className="section-title">Starred claims</h2>
              <div className="grid gap-3">
                {claims.map((claim) => {
                  const from = claimEntityMap.get(claim.from_entity);
                  const to = claimEntityMap.get(claim.to_entity);
                  const rel = RELATION_META[claim.relation_type];
                  return (
                    <div key={claim.id} className="card p-4">
                      <p className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>{rel.icon} {rel.label}</p>
                      <p className="text-sm mb-1" style={{ color: 'var(--color-text-primary)' }}>{claim.description}</p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {from ? <Link href={`/entity/${from.slug}`} style={{ color: 'var(--color-accent)' }}>{from.name}</Link> : 'Unknown'}
                        {' '}→{' '}
                        {to ? <Link href={`/entity/${to.slug}`} style={{ color: 'var(--color-accent)' }}>{to.name}</Link> : 'Unknown'}
                      </p>
                      <a href={claim.source_url} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1 mt-2" style={{ color: 'var(--color-text-muted)' }}>
                        <ExternalLink size={11} />
                        {claim.source_domain ?? 'source'}
                      </a>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {topics.length > 0 && (
            <section className="space-y-3">
              <h2 className="section-title">Starred topics</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {topics.map((topic) => (
                  <Link key={topic.id} href={`/topics/${topic.id}`} className="card p-4 hover:-translate-y-0.5 transition-transform">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{topic.title}</h3>
                      <span className="badge">{topic.is_public ? 'Public' : 'Private'}</span>
                    </div>
                    {topic.description && <p className="text-sm line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>{topic.description}</p>}
                    <p className="text-xs mt-3" style={{ color: 'var(--color-text-muted)' }}>{topic.views} views</p>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
