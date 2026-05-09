'use client';

import { useState, useEffect } from 'react';
import { Search, X, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { RELATION_META } from '@/types';
import type { Entity, ClaimWithEntity, RelationType } from '@/types';
import { gematria, numerologyValuesForEntity } from '@/lib/numerology';

const ENTITY_COLORS = ['#6366f1', '#a855f7', '#22c55e', '#f59e0b', '#ec4899'];

interface EntityWithClaims {
  entity: Entity;
  claims: ClaimWithEntity[];
  color: string;
}

interface TimelineEvent {
  date: string;
  year: number;
  entityIndex: number;
  claim: ClaimWithEntity;
  otherEntityIndex: number | null;
}

interface VisibilityPrefs {
  blacklistedDomains: Set<string>;
  whitelistedDomains: Set<string>;
  blacklistedUsers: Set<string>;
  whitelistedUsers: Set<string>;
}

async function loadVisibilityPrefs() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const [{ data: sitePrefs }, { data: userPrefs }] = await Promise.all([
    sb.from('site_preferences').select('domain, is_blacklisted, is_whitelisted').eq('user_id', user.id),
    sb.from('user_preferences').select('target_user_id, is_blacklisted, is_whitelisted').eq('user_id', user.id),
  ]);
  const prefs: VisibilityPrefs = {
    blacklistedDomains: new Set((sitePrefs ?? []).filter(s => s.is_blacklisted && !s.is_whitelisted).map(s => s.domain)),
    whitelistedDomains: new Set((sitePrefs ?? []).filter(s => s.is_whitelisted).map(s => s.domain)),
    blacklistedUsers: new Set((userPrefs ?? []).filter(s => s.is_blacklisted && !s.is_whitelisted).map(s => s.target_user_id)),
    whitelistedUsers: new Set((userPrefs ?? []).filter(s => s.is_whitelisted).map(s => s.target_user_id)),
  };
  return prefs;
}

function EntitySearchBar({ onAdd, disabled }: { onAdd: (e: Entity) => void; disabled: boolean }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Entity[]>([]);
  let timer: ReturnType<typeof setTimeout>;

  useEffect(() => {
    clearTimeout(timer);
    if (!q.trim()) { setResults([]); return; }
    timer = setTimeout(async () => {
      const sb = createClient();
      const { data } = await sb.from('entities').select('*').eq('is_public', true).ilike('name', `%${q}%`).limit(6);
      setResults((data ?? []) as Entity[]);
    }, 250);
  }, [q]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 p-2 rounded-xl" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-bg-border)' }}>
        <Search size={14} style={{ color: 'var(--color-text-muted)' }} />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={disabled ? 'Max 5 entities' : 'Add entity to timeline…'}
          disabled={disabled}
          className="flex-1 bg-transparent text-sm focus:outline-none"
          style={{ color: 'var(--color-text-primary)' }}
        />
      </div>
      {results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 rounded-xl overflow-hidden shadow-lg z-20" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-bg-border)' }}>
          {results.map(e => (
            <button key={e.id} onClick={() => { onAdd(e); setQ(''); setResults([]); }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--color-bg-hover)] transition-colors" style={{ color: 'var(--color-text-primary)' }}>
              <span className="font-medium">{e.name}</span>
              <span className="ml-2 text-xs capitalize" style={{ color: 'var(--color-text-muted)' }}>{e.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TimelinePage() {
  const [entities, setEntities] = useState<EntityWithClaims[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [visibilityPrefs, setVisibilityPrefs] = useState<VisibilityPrefs | null>(null);
  const [showNumerology, setShowNumerology] = useState(true);

  useEffect(() => {
    (async () => {
      const prefs = await loadVisibilityPrefs();
      setVisibilityPrefs(prefs);
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single();
      if (profile && 'show_numerology' in profile && profile.show_numerology === false) setShowNumerology(false);
    })();
  }, []);

  async function addEntity(entity: Entity) {
    if (entities.length >= 5 || entities.find(e => e.entity.id === entity.id)) return;
    const color = ENTITY_COLORS[entities.length];
    setLoading(l => ({ ...l, [entity.id]: true }));

    const sb = createClient();
    const { data } = await sb.rpc('entity_claims', { entity_uuid: entity.id, limit_n: 150 });
    const rawClaims = ((data ?? []) as ClaimWithEntity[]).filter(c => c.date_start);
    const claimIds = rawClaims.map(c => c.claim_id);
    let allowedClaimIds = new Set<string>(claimIds);
    if (visibilityPrefs && claimIds.length > 0) {
      const { data: claimMeta } = await sb.from('claims').select('id, created_by, source_domain').in('id', claimIds);
      allowedClaimIds = new Set(
        (claimMeta ?? [])
          .filter((meta) => {
            if (meta.source_domain && visibilityPrefs.blacklistedDomains.has(meta.source_domain) && !visibilityPrefs.whitelistedDomains.has(meta.source_domain)) return false;
            if (meta.created_by && visibilityPrefs.blacklistedUsers.has(meta.created_by) && !visibilityPrefs.whitelistedUsers.has(meta.created_by)) return false;
            return true;
          })
          .map(meta => meta.id),
      );
    }
    const claims = rawClaims.filter(c => allowedClaimIds.has(c.claim_id));

    setEntities(prev => [...prev, { entity, claims, color }]);
    setLoading(l => { const n = { ...l }; delete n[entity.id]; return n; });
  }

  function removeEntity(id: string) {
    setEntities(prev => prev.filter(e => e.entity.id !== id));
  }

  // Compute all years with events
  const allEvents: TimelineEvent[] = [];
  for (let i = 0; i < entities.length; i++) {
    const { entity, claims } = entities[i];
    for (const claim of claims) {
      if (!claim.date_start) continue;
      const year = new Date(claim.date_start).getFullYear();
      // Find if other entity is in our set
      const otherIdx = entities.findIndex(e => e.entity.id === claim.other_entity_id);
      allEvents.push({ date: claim.date_start, year, entityIndex: i, claim, otherEntityIndex: otherIdx >= 0 ? otherIdx : null });
    }
  }
  allEvents.sort((a, b) => a.date.localeCompare(b.date));

  const years = [...new Set(allEvents.map(e => e.year))].sort();
  const numericCoincidences = (() => {
    if (!showNumerology || entities.length < 2) return [] as Array<{ value: number; names: string[] }>;
    const buckets = new Map<number, string[]>();
    for (const item of entities) {
      const values = [...Object.values(gematria(item.entity.name)), ...numerologyValuesForEntity(item.entity)];
      for (const value of values) {
        const names = buckets.get(value) ?? [];
        if (!names.includes(item.entity.name)) names.push(item.entity.name);
        buckets.set(value, names);
      }
    }
    return [...buckets.entries()]
      .filter(([, names]) => names.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 8)
      .map(([value, names]) => ({ value, names }));
  })();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Timeline</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Compare up to 5 entities on parallel timelines. Connection lines show shared events.
        </p>
      </div>

      {/* Entity search */}
      <div className="grid sm:grid-cols-2 gap-3">
        <EntitySearchBar onAdd={addEntity} disabled={entities.length >= 5} />
        {Object.keys(loading).length > 0 && (
          <p className="text-xs self-center" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
        )}
      </div>

      {/* Selected entities legend */}
      {entities.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {entities.map(({ entity, color }, i) => (
            <div key={entity.id} className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm" style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
              <span style={{ color }}>{entity.name}</span>
              <button onClick={() => removeEntity(entity.id)} style={{ color, opacity: 0.7 }} className="hover:opacity-100">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Timeline grid */}
      {entities.length === 0 && (
        <div className="card p-20 text-center">
          <p style={{ color: 'var(--color-text-muted)' }}>Add entities above to see their timelines</p>
        </div>
      )}

      {entities.length > 0 && (
        <div className="card overflow-x-auto">
          <div style={{ minWidth: 600 }}>
            {/* Header: entity names */}
            <div className="grid" style={{ gridTemplateColumns: `60px repeat(${entities.length}, 1fr)`, borderBottom: '1px solid var(--color-bg-border)' }}>
              <div />
              {entities.map(({ entity, color }) => (
                <div key={entity.id} className="px-3 py-3 text-center">
                  <div className="font-medium text-sm truncate" style={{ color }}>{entity.name}</div>
                </div>
              ))}
            </div>

            {/* Timeline rows — one per event cluster by year */}
            {years.length === 0 && (
              <div className="p-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
                No dated events found for the selected entities.
              </div>
            )}

            {years.map(year => {
              const yearEvents = allEvents.filter(e => e.year === year);
              const N = entities.length;

              // Collect unique cross-entity connections for this year
              const connLines: { a: number; b: number; color: string }[] = [];
              const seen = new Set<string>();
              for (const ev of yearEvents) {
                if (ev.otherEntityIndex === null || ev.otherEntityIndex === ev.entityIndex) continue;
                const a = Math.min(ev.entityIndex, ev.otherEntityIndex);
                const b = Math.max(ev.entityIndex, ev.otherEntityIndex);
                const key = `${a}-${b}`;
                if (!seen.has(key)) { seen.add(key); connLines.push({ a, b, color: entities[a].color }); }
              }

              return (
                <div
                  key={year}
                  className="grid relative"
                  style={{ gridTemplateColumns: `60px repeat(${N}, 1fr)`, borderBottom: '1px solid var(--color-bg-border)' }}
                >
                  {/* Year label */}
                  <div className="flex items-start justify-center pt-3 pb-2">
                    <span className="text-xs font-mono font-semibold" style={{ color: 'var(--color-text-muted)' }}>{year}</span>
                  </div>

                  {/* Entity columns */}
                  {entities.map(({ entity, color }, colIdx) => {
                    const colEvents = yearEvents.filter(e => e.entityIndex === colIdx);
                    return (
                      <div key={entity.id} className="px-2 py-2 space-y-1.5 relative" style={{ borderLeft: '1px solid var(--color-bg-border)' }}>
                        {/* Vertical spine */}
                        <div className="absolute left-1/2 inset-y-0 w-px -translate-x-1/2 opacity-20" style={{ background: color }} />

                        {colEvents.map((ev, i) => {
                          const meta = RELATION_META[ev.claim.relation_type as RelationType];
                          return (
                            <div
                              key={`${ev.claim.claim_id}-${i}`}
                              className="relative rounded-lg px-2 py-1.5 text-xs z-10"
                              style={{ background: `${color}15`, border: `1px solid ${color}25` }}
                              title={ev.claim.description}
                            >
                              <div className="flex items-center gap-1">
                                <span>{meta.icon}</span>
                                <span className="truncate" style={{ color }}>{ev.claim.other_entity_name}</span>
                              </div>
                            </div>
                          );
                        })}

                        {colEvents.length === 0 && <div className="h-4" />}
                      </div>
                    );
                  })}

                  {/* Horizontal connectors spanning across columns — rendered at row level */}
                  {connLines.map(({ a, b, color }) => {
                    const leftPct = `calc(60px + (${a} + 0.5) / ${N} * (100% - 60px))`;
                    const widthPct = `calc(${b - a} / ${N} * (100% - 60px))`;
                    return (
                      <div key={`${a}-${b}`} style={{ position: 'absolute', top: 1, left: leftPct, width: widthPct, pointerEvents: 'none', zIndex: 5 }}>
                        {/* Line */}
                        <div style={{
                          width: '100%', height: 3,
                          background: `linear-gradient(90deg, ${entities[a].color}, ${entities[b].color})`,
                          opacity: 0.8, borderRadius: 2,
                        }} />
                        {/* Left dot */}
                        <div style={{
                          position: 'absolute', left: -4, top: '50%', transform: 'translateY(-50%)',
                          width: 7, height: 7, borderRadius: '50%',
                          background: entities[a].color, border: '2px solid var(--color-bg-base)',
                        }} />
                        {/* Right dot */}
                        <div style={{
                          position: 'absolute', right: -4, top: '50%', transform: 'translateY(-50%)',
                          width: 7, height: 7, borderRadius: '50%',
                          background: entities[b].color, border: '2px solid var(--color-bg-base)',
                        }} />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showNumerology && numericCoincidences.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
            Numeric coincidences (selected entities)
          </h2>
          <div className="space-y-1.5">
            {numericCoincidences.map((item) => (
              <div key={item.value} className="text-xs rounded px-2 py-1.5" style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)' }}>
                <span style={{ color: 'var(--color-text-primary)' }}>#{item.value}</span> · {item.names.join(' ↔ ')}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
