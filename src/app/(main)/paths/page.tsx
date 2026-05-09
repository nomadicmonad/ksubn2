'use client';

import { useState } from 'react';
import { Search, GitBranch, ArrowRight, ExternalLink, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { EntityPill } from '@/components/entity/EntityCard';
import { RELATION_META } from '@/types';
import type { Entity, DerivedPath, PathStep, RelationType } from '@/types';

interface PathWithEntities {
  hops: number;
  steps: Array<{
    entity: Entity;
    claim?: {
      relation_type: RelationType;
      description: string;
      source_url: string;
      source_domain: string;
    };
  }>;
}

function EntitySearch({ label, onSelect }: { label: string; onSelect: (e: Entity) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Entity[]>([]);
  const [selected, setSelected] = useState<Entity | null>(null);
  let timer: ReturnType<typeof setTimeout>;

  async function search(v: string) {
    setQ(v);
    clearTimeout(timer);
    if (!v.trim()) { setResults([]); return; }
    timer = setTimeout(async () => {
      const sb = createClient();
      const { data } = await sb.from('entities').select('*').eq('is_public', true).ilike('name', `%${v}%`).limit(6);
      setResults((data ?? []) as Entity[]);
    }, 250);
  }

  if (selected) {
    return (
      <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--color-bg-hover)', border: '1px solid var(--color-bg-border)' }}>
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{selected.name}</p>
          <p className="text-xs capitalize" style={{ color: 'var(--color-text-muted)' }}>{selected.type}</p>
        </div>
        <button onClick={() => { setSelected(null); setQ(''); }} className="btn-ghost text-xs py-1">Change</button>
      </div>
    );
  }

  return (
    <div className="relative">
      <p className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
        <input className="input pl-8" value={q} onChange={e => search(e.target.value)} placeholder="Search…" />
      </div>
      {results.length > 0 && (
        <div className="absolute z-10 w-full mt-1 rounded-xl overflow-hidden shadow-lg" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-bg-border)' }}>
          {results.map(e => (
            <button key={e.id} onClick={() => { setSelected(e); onSelect(e); setResults([]); }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--color-bg-hover)] transition-colors"
              style={{ color: 'var(--color-text-primary)' }}>
              {e.name} <span className="text-xs ml-1 capitalize" style={{ color: 'var(--color-text-muted)' }}>{e.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PathsPage() {
  const [fromEntity, setFromEntity] = useState<Entity | null>(null);
  const [toEntity, setToEntity] = useState<Entity | null>(null);
  const [path, setPath] = useState<PathWithEntities | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [computing, setComputing] = useState(false);

  async function findPath() {
    if (!fromEntity || !toEntity) return;
    setLoading(true);
    setError('');
    setPath(null);

    try {
      const sb = createClient();

      // Check pre-computed paths first
      const { data: stored } = await sb
        .from('derived_paths')
        .select('*')
        .or(`and(from_entity.eq.${fromEntity.id},to_entity.eq.${toEntity.id}),and(from_entity.eq.${toEntity.id},to_entity.eq.${fromEntity.id})`)
        .order('hops')
        .limit(1)
        .single();

      if (stored) {
        await buildPathDisplay(stored as any, sb);
      } else {
        // BFS up to 4 hops
        setComputing(true);
        const result = await bfsPath(fromEntity.id, toEntity.id, sb);
        setComputing(false);
        if (result) {
          await buildPathDisplay(result, sb);
        } else {
          setError('No path found within 4 hops. These entities may not be connected in the current dataset.');
        }
      }
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
      setComputing(false);
    }
  }

  async function bfsPath(fromId: string, toId: string, sb: ReturnType<typeof createClient>) {
    // Simple BFS using database queries
    const visited = new Map<string, { path: PathStep[]; parentId: string | null }>();
    visited.set(fromId, { path: [], parentId: null });
    const queue: string[] = [fromId];
    const MAX_HOPS = 4;

    for (let hop = 0; hop < MAX_HOPS && queue.length > 0; hop++) {
      const current = [...queue];
      queue.length = 0;

      const { data: claims } = await sb
        .from('claims')
        .select('id, from_entity, to_entity, relation_type')
        .or(`from_entity.in.(${current.join(',')}),to_entity.in.(${current.join(',')})`)
        .eq('is_public', true)
        .eq('is_hidden', false);

      for (const claim of (claims ?? [])) {
        const neighbours = [
          { id: claim.to_entity, claimId: claim.id, viaSource: claim.from_entity },
          { id: claim.from_entity, claimId: claim.id, viaSource: claim.to_entity },
        ];

        for (const { id, claimId, viaSource } of neighbours) {
          if (visited.has(id)) continue;
          const parentPath = visited.get(viaSource)?.path ?? [];
          const newPath: PathStep[] = [...parentPath, { entity_id: viaSource, claim_id: claimId }];
          visited.set(id, { path: newPath, parentId: viaSource });
          queue.push(id);

          if (id === toId) {
            const finalPath = [...newPath, { entity_id: toId, claim_id: claimId }];
            return { from_entity: fromId, to_entity: toId, hops: hop + 1, path: finalPath };
          }
        }
      }
    }
    return null;
  }

  async function buildPathDisplay(result: { from_entity: string; to_entity: string; hops: number; path: PathStep[] }, sb: ReturnType<typeof createClient>) {
    const entityIds = [...new Set(result.path.map(s => s.entity_id))];
    const claimIds = [...new Set(result.path.map(s => s.claim_id).filter(Boolean))];

    const [{ data: entities }, { data: claims }] = await Promise.all([
      sb.from('entities').select('*').in('id', entityIds),
      sb.from('claims').select('id, relation_type, description, source_url, source_domain').in('id', claimIds),
    ]);

    const entityMap = Object.fromEntries((entities ?? []).map(e => [e.id, e as Entity]));
    const claimMap = Object.fromEntries((claims ?? []).map(c => [c.id, c]));

    const steps = result.path.map((step, i) => ({
      entity: entityMap[step.entity_id],
      claim: i < result.path.length - 1 ? claimMap[step.claim_id] : undefined,
    })).filter(s => s.entity);

    setPath({ hops: result.hops, steps });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
          <GitBranch size={24} style={{ color: 'var(--color-accent)' }} />
          Find the path
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Discover how two people or organizations are connected — up to 4 hops.
        </p>
      </div>

      {/* Input */}
      <div className="card p-6 space-y-4">
        <EntitySearch label="From" onSelect={setFromEntity} />
        <div className="flex items-center justify-center gap-3">
          <div className="flex-1 h-px" style={{ background: 'var(--color-bg-border)' }} />
          <ArrowRight size={16} style={{ color: 'var(--color-text-muted)' }} />
          <div className="flex-1 h-px" style={{ background: 'var(--color-bg-border)' }} />
        </div>
        <EntitySearch label="To" onSelect={setToEntity} />

        <button
          onClick={findPath}
          disabled={loading || !fromEntity || !toEntity}
          className="btn-primary w-full justify-center"
        >
          {loading ? (computing ? 'Computing path…' : 'Loading…') : 'Find connection'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl p-4" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertCircle size={16} style={{ color: 'var(--color-danger)', flexShrink: 0, marginTop: 2 }} />
          <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>
        </div>
      )}

      {/* Path display */}
      {path && (
        <div className="space-y-4 animate-fade-in">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Connected in <span style={{ color: 'var(--color-accent)' }}>{path.hops} hop{path.hops !== 1 ? 's' : ''}</span>
          </h2>

          <div className="space-y-2">
            {path.steps.map((step, i) => (
              <div key={i} className="space-y-2">
                {/* Entity box */}
                <div className="card p-4">
                  <EntityPill entity={step.entity} />
                  {step.entity.description && (
                    <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>{step.entity.description}</p>
                  )}
                </div>

                {/* Claim connector */}
                {step.claim && (
                  <div className="flex items-start gap-3 px-4">
                    <div className="w-px flex-shrink-0 self-stretch" style={{ background: 'var(--color-bg-border)', marginLeft: 12 }} />
                    <div className="flex-1 py-2">
                      <span className={`badge rel-${step.claim.relation_type} mb-1`}>
                        {RELATION_META[step.claim.relation_type as RelationType].icon}{' '}
                        {RELATION_META[step.claim.relation_type as RelationType].label}
                      </span>
                      <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{step.claim.description}</p>
                      {step.claim.source_url && (
                        <a
                          href={step.claim.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs mt-1 hover:underline"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          <ExternalLink size={10} />
                          {step.claim.source_domain ?? 'source'}
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
