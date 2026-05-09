import Link from 'next/link';
import { Clock, ExternalLink, Users, Building2, Calendar } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { RELATION_META } from '@/types';
import type { RelationType } from '@/types';

export const metadata = { title: 'Recent connections' };
export const revalidate = 60;

export default async function RecentPage() {
  const supabase = await createClient();

  const { data: recentClaims } = await supabase
    .from('claims')
    .select(`
      id, relation_type, description, source_domain, source_url, created_at, is_bulkbot,
      from_entity:entities!claims_from_entity_fkey(id, name, slug, type),
      to_entity:entities!claims_to_entity_fkey(id, name, slug, type),
      profile:profiles(display_name, at_name)
    `)
    .eq('is_public', true)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(40);

  const { data: recentEntities } = await supabase
    .from('entities')
    .select('id, name, slug, type, description, created_at, is_bulkbot')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(12);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
          <Clock size={22} style={{ color: 'var(--color-accent)' }} />
          Recent activity
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Latest connections and entities added to the graph.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent claims — main column */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="section-title">New connections</h2>
          {(recentClaims ?? []).map((c: any) => {
            const meta = RELATION_META[c.relation_type as RelationType];
            return (
              <div key={c.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      <Link href={`/entity/${c.from_entity.slug}`}
                        className="text-sm font-semibold hover:underline"
                        style={{ color: 'var(--color-text-primary)' }}>
                        {c.from_entity.name}
                      </Link>
                      <span className={`badge rel-${c.relation_type} text-xs`}>
                        {meta.icon} {meta.label}
                      </span>
                      <Link href={`/entity/${c.to_entity.slug}`}
                        className="text-sm font-semibold hover:underline"
                        style={{ color: 'var(--color-text-primary)' }}>
                        {c.to_entity.name}
                      </Link>
                    </div>
                    <p className="text-xs line-clamp-2" style={{ color: 'var(--color-text-secondary)' }}>
                      {c.description}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {c.source_domain && (
                        <a href={c.source_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 hover:underline">
                          <ExternalLink size={10} /> {c.source_domain}
                        </a>
                      )}
                      <span>{new Date(c.created_at).toLocaleDateString()}</span>
                      {c.is_bulkbot ? (
                        <span style={{ color: 'var(--color-text-muted)' }}>bulkbot</span>
                      ) : c.profile && (
                        <Link href={`/user/${encodeURIComponent(c.profile.at_name)}`}
                          className="hover:underline"
                          style={{ color: 'var(--color-accent)' }}>
                          {c.profile.at_name}
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Recent entities — sidebar */}
        <div>
          <h2 className="section-title mb-3">New entities</h2>
          <div className="space-y-2">
            {(recentEntities ?? []).map((e: any) => {
              const Icon = e.type === 'person' ? Users : e.type === 'organization' ? Building2 : Calendar;
              const color = e.type === 'person' ? 'var(--color-accent)' : e.type === 'organization' ? 'var(--color-kpurple)' : 'var(--color-warning)';
              return (
                <Link key={e.id} href={`/entity/${e.slug}`}
                  className="card p-3 flex items-start gap-3 group hover:border-[rgba(99,102,241,0.3)] transition-all">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: `${color}18`, color }}>
                    <Icon size={14} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-[var(--color-accent)] transition-colors"
                      style={{ color: 'var(--color-text-primary)' }}>
                      {e.name}
                    </p>
                    <p className="text-xs line-clamp-1" style={{ color: 'var(--color-text-muted)' }}>
                      {e.description ?? e.type}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
