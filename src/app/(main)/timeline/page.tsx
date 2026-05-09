'use client';

import { useState, useEffect } from 'react';
import { Search, X, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { RELATION_META } from '@/types';
import type { Entity, ClaimWithEntity, RelationType } from '@/types';

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

  async function addEntity(entity: Entity) {
    if (entities.length >= 5 || entities.find(e => e.entity.id === entity.id)) return;
    const color = ENTITY_COLORS[entities.length];
    setLoading(l => ({ ...l, [entity.id]: true }));

    const sb = createClient();
    const { data } = await sb.rpc('entity_claims', { entity_uuid: entity.id, limit_n: 100 });
    const claims = ((data ?? []) as ClaimWithEntity[]).filter(c => c.date_start);

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
  const minYear = years[0] ?? new Date().getFullYear() - 30;
  const maxYear = years[years.length - 1] ?? new Date().getFullYear();

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
              return (
                <div
                  key={year}
                  className="grid"
                  style={{ gridTemplateColumns: `60px repeat(${entities.length}, 1fr)`, borderBottom: '1px solid var(--color-bg-border)' }}
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
                        {/* Vertical line */}
                        <div className="absolute left-1/2 inset-y-0 w-px -translate-x-1/2 opacity-20" style={{ background: color }} />

                        {colEvents.map((ev, i) => {
                          const meta = RELATION_META[ev.claim.relation_type as RelationType];
                          const hasLink = ev.otherEntityIndex !== null && ev.otherEntityIndex !== colIdx;
                          return (
                            <div
                              key={`${ev.claim.claim_id}-${i}`}
                              className="relative rounded-lg px-2 py-1.5 text-xs"
                              style={{ background: `${color}15`, border: `1px solid ${color}25` }}
                              title={ev.claim.description}
                            >
                              <div className="flex items-center gap-1">
                                <span>{meta.icon}</span>
                                <span className="truncate" style={{ color }}>{ev.claim.other_entity_name}</span>
                              </div>

                              {/* Connection line to other entity column */}
                              {hasLink && (
                                <div
                                  className="absolute top-1/2 -translate-y-1/2 h-px opacity-60"
                                  style={{
                                    background: color,
                                    right: colIdx < ev.otherEntityIndex! ? 0 : 'auto',
                                    left: colIdx > ev.otherEntityIndex! ? 0 : 'auto',
                                    width: `${Math.abs(colIdx - ev.otherEntityIndex!) * 100}%`,
                                  }}
                                />
                              )}
                            </div>
                          );
                        })}

                        {colEvents.length === 0 && (
                          <div className="h-4" /> // spacer
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
