'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, GitBranch, ArrowRight, ExternalLink, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { EntityPill } from '@/components/entity/EntityCard';
import { RELATION_META } from '@/types';
import type { Entity, PathStep, RelationType } from '@/types';
import { gematria, numerologyValuesForEntity } from '@/lib/numerology';

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

interface VisibilityPrefs {
  blacklistedDomains: Set<string>;
  whitelistedDomains: Set<string>;
  blacklistedUsers: Set<string>;
  whitelistedUsers: Set<string>;
}

async function loadVisibilityPrefs(sb: ReturnType<typeof createClient>): Promise<VisibilityPrefs | null> {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const [{ data: sitePrefs }, { data: userPrefs }] = await Promise.all([
    sb.from('site_preferences').select('domain, is_blacklisted, is_whitelisted').eq('user_id', user.id),
    sb.from('user_preferences').select('target_user_id, is_blacklisted, is_whitelisted').eq('user_id', user.id),
  ]);
  return {
    blacklistedDomains: new Set((sitePrefs ?? []).filter(s => s.is_blacklisted && !s.is_whitelisted).map(s => s.domain)),
    whitelistedDomains: new Set((sitePrefs ?? []).filter(s => s.is_whitelisted).map(s => s.domain)),
    blacklistedUsers: new Set((userPrefs ?? []).filter(s => s.is_blacklisted && !s.is_whitelisted).map(s => s.target_user_id)),
    whitelistedUsers: new Set((userPrefs ?? []).filter(s => s.is_whitelisted).map(s => s.target_user_id)),
  };
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
  const [showNumerology, setShowNumerology] = useState(true);

  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single();
      if (profile && 'show_numerology' in profile && profile.show_numerology === false) setShowNumerology(false);
    })();
  }, []);

  async function findPath() {
    if (!fromEntity || !toEntity) return;
    setLoading(true);
    setError('');
    setPath(null);

    try {
      // Use server-side BFS API (persists results + faster)
      setComputing(true);
      const res = await fetch('/api/paths/compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_entity: fromEntity.id, to_entity: toEntity.id }),
      });
      setComputing(false);
      const json = await res.json();
      const sb = createClient();
      if (json.path) {
        await buildPathDisplay(json.path, sb);
      } else {
        setError('No path found within 4 hops. These entities may not be connected in the current dataset.');
      }
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
      setComputing(false);
    }
  }

  async function buildPathDisplay(result: { from_entity: string; to_entity: string; hops: number; path: PathStep[] }, sb: ReturnType<typeof createClient>) {
    const entityIds = [...new Set(result.path.map(s => s.entity_id))];
    const claimIds = [...new Set(result.path.map(s => s.claim_id).filter(Boolean))];

    const [{ data: entities }, { data: claims }, visibilityPrefs] = await Promise.all([
      sb.from('entities').select('*').in('id', entityIds),
      sb.from('claims').select('id, relation_type, description, source_url, source_domain, created_by').in('id', claimIds),
      loadVisibilityPrefs(sb),
    ]);

    const entityMap = Object.fromEntries((entities ?? []).map(e => [e.id, e as Entity]));
    const claimMap = Object.fromEntries(
      (claims ?? [])
        .filter((claim) => {
          if (!visibilityPrefs) return true;
          if (claim.source_domain && visibilityPrefs.blacklistedDomains.has(claim.source_domain) && !visibilityPrefs.whitelistedDomains.has(claim.source_domain)) return false;
          if (claim.created_by && visibilityPrefs.blacklistedUsers.has(claim.created_by) && !visibilityPrefs.whitelistedUsers.has(claim.created_by)) return false;
          return true;
        })
        .map(c => [c.id, c]),
    );

    const steps = result.path.map((step, i) => ({
      entity: entityMap[step.entity_id],
      claim: i < result.path.length - 1 ? claimMap[step.claim_id] : undefined,
    })).filter(s => s.entity);

    if (steps.some((step, index) => index < steps.length - 1 && !step.claim)) {
      setError('A path exists, but one or more connecting claims are hidden by your preferences.');
      setPath(null);
      return;
    }

    setPath({ hops: result.hops, steps });
  }

  const pathCoincidences = useMemo(() => {
    if (!showNumerology || !path) return [] as Array<{ value: number; entities: string[] }>;
    const buckets = new Map<number, string[]>();
    for (const step of path.steps) {
      const values = [...Object.values(gematria(step.entity.name)), ...numerologyValuesForEntity(step.entity)];
      for (const value of values) {
        const current = buckets.get(value) ?? [];
        if (!current.includes(step.entity.name)) current.push(step.entity.name);
        buckets.set(value, current);
      }
    }
    return [...buckets.entries()]
      .filter(([, names]) => names.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 10)
      .map(([value, entities]) => ({ value, entities }));
  }, [path, showNumerology]);

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

          {showNumerology && pathCoincidences.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
                Numeric coincidences on this path
              </h3>
              <div className="space-y-1.5">
                {pathCoincidences.map((item) => (
                  <div key={item.value} className="text-xs rounded px-2 py-1.5" style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)' }}>
                    <span style={{ color: 'var(--color-text-primary)' }}>#{item.value}</span> · {item.entities.join(' ↔ ')}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
