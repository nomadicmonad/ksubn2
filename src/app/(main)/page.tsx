import Link from 'next/link';
import { Search, Network, GitBranch, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { EntityCard } from '@/components/entity/EntityCard';
import type { Entity } from '@/types';

async function getStats() {
  const supabase = await createClient();
  const [{ count: entities }, { count: claims }] = await Promise.all([
    supabase.from('entities').select('*', { count: 'exact', head: true }),
    supabase.from('claims').select('*', { count: 'exact', head: true }),
  ]);
  return { entities: entities ?? 0, claims: claims ?? 0 };
}

async function getFeaturedEntities(): Promise<Entity[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('entities')
    .select('*')
    .eq('is_public', true)
    .order('direct_claim_count', { ascending: false })
    .limit(6);
  return data ?? [];
}

export default async function HomePage() {
  const [stats, featured] = await Promise.all([getStats(), getFeaturedEntities()]);

  return (
    <div className="space-y-16 py-8">
      {/* Hero */}
      <section className="text-center space-y-6 max-w-3xl mx-auto">
        {/* Logo mark */}
        <div className="flex justify-center mb-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-bold"
            style={{ background: 'var(--color-accent-dim)', color: 'var(--color-accent)', border: '1px solid rgba(99,102,241,0.3)' }}
          >
            K<sub style={{ fontSize: '0.7em', color: 'var(--color-kpurple)' }}>n</sub>
          </div>
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
          Map the{' '}
          <span style={{ color: 'var(--color-accent)' }}>hidden connections</span>
        </h1>
        <p className="text-lg" style={{ color: 'var(--color-text-secondary)' }}>
          The AI-supercharged knowledge graph for people, organizations, and events.
          Source every link. Find every path. Share what you discover.
        </p>

        {/* Search bar */}
        <form action="/search" className="relative max-w-xl mx-auto">
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--color-text-muted)' }}
          />
          <input
            name="q"
            type="text"
            placeholder="Search people, organizations, events…"
            className="w-full pl-11 pr-4 py-3.5 rounded-xl text-sm focus:outline-none transition-all"
            style={{
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-bg-border)',
              color: 'var(--color-text-primary)',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'rgba(99,102,241,0.6)';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-bg-border)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
          <button
            type="submit"
            className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: 'var(--color-accent)' }}
          >
            Search
          </button>
        </form>

        {/* Stats */}
        <div className="flex items-center justify-center gap-8">
          {[
            { value: stats.entities.toLocaleString(), label: 'entities' },
            { value: stats.claims.toLocaleString(), label: 'connections' },
          ].map(({ value, label }) => (
            <div key={label} className="text-center">
              <div className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{value}</div>
              <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Feature cards */}
      <section className="grid sm:grid-cols-3 gap-4">
        {[
          {
            href: '/paths',
            icon: GitBranch,
            title: 'Find paths',
            desc: 'Discover how any two people or organizations are connected through shared events and relationships.',
            color: 'var(--color-accent)',
          },
          {
            href: '/graph',
            icon: Network,
            title: 'Explore the graph',
            desc: 'Interactive node graph. Click to expand, filter by relationship type, undo operations.',
            color: 'var(--color-kpurple)',
          },
          {
            href: '/timeline',
            icon: GitBranch,
            title: 'Timeline view',
            desc: 'See up to five entities on parallel timelines with connection lines between them.',
            color: 'var(--color-success)',
          },
        ].map(({ href, icon: Icon, title, desc, color }) => (
          <Link
            key={href}
            href={href}
            className="card p-6 group hover:border-[var(--color-accent)]/40 transition-all duration-200"
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
              style={{ background: `${color}20`, color }}
            >
              <Icon size={20} />
            </div>
            <h3 className="font-semibold mb-1.5" style={{ color: 'var(--color-text-primary)' }}>{title}</h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{desc}</p>
            <div
              className="flex items-center gap-1 mt-4 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color }}
            >
              Try it <ArrowRight size={14} />
            </div>
          </Link>
        ))}
      </section>

      {/* Most connected entities */}
      {featured.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Most connected
            </h2>
            <Link
              href="/search"
              className="flex items-center gap-1 text-sm hover:underline"
              style={{ color: 'var(--color-accent)' }}
            >
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {featured.map(entity => (
              <EntityCard key={entity.id} entity={entity} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
