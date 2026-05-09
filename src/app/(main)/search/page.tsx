import { Suspense } from 'react';
import { Search, Filter } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { EntityCard } from '@/components/entity/EntityCard';
import type { Entity, EntityType } from '@/types';

interface Props {
  searchParams: Promise<{ q?: string; type?: string; tag?: string; page?: string }>;
}

async function SearchResults({ q, type, tag }: { q: string; type: string; tag: string }) {
  const supabase = await createClient();
  const PAGE_SIZE = 24;

  let query = supabase
    .from('entities')
    .select('*')
    .eq('is_public', true)
    .order('direct_claim_count', { ascending: false })
    .limit(PAGE_SIZE);

  if (q) query = query.ilike('name', `%${q}%`);
  if (type && type !== 'all') query = query.eq('type', type as EntityType);
  if (tag) query = query.contains('tags', [tag]);

  const { data } = await query;
  const results = (data ?? []) as Entity[];

  if (results.length === 0) {
    return (
      <div className="text-center py-20">
        <Search size={40} className="mx-auto mb-4 opacity-30" style={{ color: 'var(--color-text-muted)' }} />
        <p className="text-lg font-medium" style={{ color: 'var(--color-text-primary)' }}>No results found</p>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Try a different search or <a href="/submit" style={{ color: 'var(--color-accent)' }}>add a new entity</a>.
        </p>
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {results.map(entity => <EntityCard key={entity.id} entity={entity} />)}
    </div>
  );
}

export default async function SearchPage({ searchParams }: Props) {
  const { q = '', type = 'all', tag = '' } = await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>
          {q ? `Search: "${q}"` : tag ? `Tag: ${tag}` : 'Explore entities'}
        </h1>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          People, organizations, and events in the knowledge graph.
        </p>
      </div>

      {/* Search + filter bar */}
      <form className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search people, orgs, events…"
            className="input pl-9"
          />
        </div>
        <select
          name="type"
          defaultValue={type}
          className="input w-full sm:w-auto sm:min-w-36"
        >
          <option value="all">All types</option>
          <option value="person">People</option>
          <option value="organization">Organizations</option>
          <option value="event">Events</option>
        </select>
        <button type="submit" className="btn-primary">
          <Filter size={14} />
          Filter
        </button>
      </form>

      <Suspense key={`${q}-${type}-${tag}`} fallback={
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="card h-24 animate-pulse" style={{ background: 'var(--color-bg-card)' }} />
          ))}
        </div>
      }>
        <SearchResults q={q} type={type} tag={tag} />
      </Suspense>
    </div>
  );
}
