'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Network, Clock, GitBranch, List, BarChart2, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatDate } from '@/lib/utils';
import { RELATION_META, type ClaimWithEntity, type Entity, type PathStep, type RelationType, type Topic, type TopicTab, type TabViewType } from '@/types';
import { GraphView } from '@/components/graph/GraphView';
import { gematria, numerologyValuesForEntity } from '@/lib/numerology';

const TAB_ICONS: Record<TabViewType, React.ComponentType<{ size: number }>> = {
  graph:       Network,
  timeline:    Clock,
  profile:     BarChart2,
  connections: GitBranch,
  list:        List,
};

interface Props { topic: Topic; tabs: TopicTab[]; showNumerology: boolean }

export function EmbedClient({ topic, tabs, showNumerology }: Props) {
  const [activeTab, setActiveTab] = useState(0);
  const currentTab = tabs[activeTab];

  return (
    <div
      className="flex flex-col"
      style={{
        height: '100vh',
        background: 'var(--color-bg-base)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Minimal embed header */}
      <div
        className="flex items-center justify-between px-4 py-2 flex-shrink-0"
        style={{ background: 'var(--color-bg-surface)', borderBottom: '1px solid var(--color-bg-border)' }}
      >
        <div className="flex items-center gap-3">
          {/* ksubn logomark */}
          <span className="font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>
            K<span style={{ color: 'var(--color-accent)' }}>n</span>
          </span>
          <span className="text-sm font-medium truncate max-w-xs" style={{ color: 'var(--color-text-primary)' }}>
            {topic.title}
          </span>
        </div>
        <Link
          href={`/topics/${topic.id}`}
          target="_blank"
          className="flex items-center gap-1 text-xs hover:underline flex-shrink-0"
          style={{ color: 'var(--color-accent)' }}
        >
          <ExternalLink size={11} />
          Open in ksubn
        </Link>
      </div>

      {/* Tab bar */}
      {tabs.length > 1 && (
        <div
          className="flex items-center gap-1 px-3 overflow-x-auto flex-shrink-0"
          style={{ background: 'var(--color-bg-card)', borderBottom: '1px solid var(--color-bg-border)' }}
        >
          {tabs.map((tab, i) => {
            const Icon = TAB_ICONS[tab.view_type];
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(i)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap"
                style={{
                  color: activeTab === i ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  borderBottom: activeTab === i ? '2px solid var(--color-accent)' : '2px solid transparent',
                }}
              >
                <Icon size={12} />
                {tab.title}
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {!currentTab && (
          <div className="h-full flex items-center justify-center" style={{ color: 'var(--color-text-muted)' }}>
            No content in this topic yet.
          </div>
        )}
        {currentTab?.view_type === 'graph' && <GraphView showNumerologyOverride={showNumerology} />}
        {currentTab?.view_type === 'timeline' && <EmbedTimelineTab tab={currentTab} showNumerology={showNumerology} />}
        {currentTab?.view_type === 'connections' && <EmbedConnectionsTab tab={currentTab} showNumerology={showNumerology} />}
        {currentTab?.view_type === 'profile' && <EmbedProfileTab tab={currentTab} showNumerology={showNumerology} />}
        {currentTab?.view_type === 'list' && <EmbedListTab tab={currentTab} />}
      </div>
    </div>
  );
}

function getConfigEntityIds(tab: TopicTab): string[] {
  const ids = Array.isArray(tab.config?.entity_ids) ? tab.config.entity_ids : [];
  return ids.filter((value): value is string => typeof value === 'string' && value.length > 0).slice(0, 5);
}

function getConfigRelationTypes(tab: TopicTab): RelationType[] {
  const values = Array.isArray(tab.config?.filter_types) ? tab.config.filter_types : [];
  return values.filter((value): value is RelationType => typeof value === 'string' && value in RELATION_META);
}

function EmbedTimelineTab({ tab, showNumerology }: { tab: TopicTab; showNumerology: boolean }) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [claimsByEntity, setClaimsByEntity] = useState<Record<string, ClaimWithEntity[]>>({});

  useEffect(() => {
    (async () => {
      const ids = getConfigEntityIds(tab);
      if (ids.length === 0) {
        setEntities([]);
        setClaimsByEntity({});
        return;
      }
      const sb = createClient();
      const { data: entityRows } = await sb.from('entities').select('*').in('id', ids);
      const ordered = ids.map(id => (entityRows ?? []).find(e => e.id === id)).filter(Boolean) as Entity[];
      setEntities(ordered);
      const results = await Promise.all(
        ids.map(async (id) => {
          const { data } = await sb.rpc('entity_claims', { entity_uuid: id, limit_n: 120 });
          return [id, ((data ?? []) as ClaimWithEntity[]).filter(c => c.date_start)] as const;
        }),
      );
      setClaimsByEntity(Object.fromEntries(results));
    })();
  }, [tab.id, JSON.stringify(tab.config)]);

  const coincidences = useMemo(() => {
    if (!showNumerology || entities.length < 2) return [] as Array<{ value: number; names: string[] }>;
    const buckets = new Map<number, string[]>();
    for (const entity of entities) {
      for (const value of [...Object.values(gematria(entity.name)), ...numerologyValuesForEntity(entity)]) {
        const names = buckets.get(value) ?? [];
        if (!names.includes(entity.name)) names.push(entity.name);
        buckets.set(value, names);
      }
    }
    return [...buckets.entries()].filter(([, names]) => names.length >= 2).slice(0, 6).map(([value, names]) => ({ value, names }));
  }, [entities, showNumerology]);

  if (entities.length === 0) return <EmptyEmbedCard message="Set entity_ids to render timeline." />;

  return (
    <div className="h-full overflow-auto p-3 space-y-3">
      {entities.map((entity) => {
        const rows = (claimsByEntity[entity.id] ?? []).sort((a, b) => (a.date_start ?? '').localeCompare(b.date_start ?? '')).slice(0, 16);
        return (
          <div key={entity.id} className="rounded-lg p-3" style={{ border: '1px solid var(--color-bg-border)', background: 'var(--color-bg-card)' }}>
            <Link href={`/entity/${entity.slug}`} target="_blank" className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{entity.name}</Link>
            <div className="mt-2 space-y-1.5">
              {rows.length === 0 && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No dated claims.</p>}
              {rows.map((claim) => (
                <p key={claim.claim_id} className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>{formatDate(claim.date_start)}:</span> {claim.description}
                </p>
              ))}
            </div>
          </div>
        );
      })}
      {showNumerology && coincidences.length > 0 && (
        <div className="rounded-lg p-3" style={{ border: '1px solid var(--color-bg-border)', background: 'var(--color-bg-card)' }}>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>Numeric coincidences</p>
          <div className="space-y-1.5">
            {coincidences.map((item) => (
              <p key={item.value} className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                <span style={{ color: 'var(--color-text-primary)' }}>#{item.value}</span> · {item.names.join(' ↔ ')}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EmbedConnectionsTab({ tab, showNumerology }: { tab: TopicTab; showNumerology: boolean }) {
  const [path, setPath] = useState<{ hops: number; path: PathStep[] } | null>(null);
  const [entities, setEntities] = useState<Record<string, Entity>>({});
  const [claims, setClaims] = useState<Record<string, { relation_type: RelationType; description: string }>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const from = typeof tab.config?.from_entity === 'string' ? tab.config.from_entity : '';
      const to = typeof tab.config?.to_entity === 'string' ? tab.config.to_entity : '';
      if (!from || !to) {
        setPath(null);
        return;
      }
      const res = await fetch('/api/paths/compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_entity: from, to_entity: to, max_hops: 4 }),
      });
      const json = await res.json();
      if (!json.path) {
        setPath(null);
        setError('No path found.');
        return;
      }
      setPath(json.path);
      const steps = json.path.path as PathStep[];
      const entityIds = [...new Set(steps.map(s => s.entity_id))];
      const claimIds = [...new Set(steps.map(s => s.claim_id).filter(Boolean))];
      const sb = createClient();
      const [{ data: entityRows }, { data: claimRows }] = await Promise.all([
        sb.from('entities').select('*').in('id', entityIds),
        sb.from('claims').select('id, relation_type, description').in('id', claimIds),
      ]);
      setEntities(Object.fromEntries((entityRows ?? []).map(e => [e.id, e as Entity])));
      setClaims(Object.fromEntries((claimRows ?? []).map(c => [c.id, c as { relation_type: RelationType; description: string }])));
    })();
  }, [tab.id, JSON.stringify(tab.config)]);

  const coincidenceRows = useMemo(() => {
    if (!showNumerology) return [] as Array<{ value: number; names: string[] }>;
    const values = Object.values(entities);
    if (values.length < 2) return [];
    const buckets = new Map<number, string[]>();
    for (const entity of values) {
      for (const value of Object.values(gematria(entity.name))) {
        const names = buckets.get(value) ?? [];
        if (!names.includes(entity.name)) names.push(entity.name);
        buckets.set(value, names);
      }
    }
    return [...buckets.entries()].filter(([, names]) => names.length >= 2).slice(0, 6).map(([value, names]) => ({ value, names }));
  }, [entities, showNumerology]);

  if (!path) return <EmptyEmbedCard message={error || 'Set from_entity and to_entity to render path.'} />;

  return (
    <div className="h-full overflow-auto p-3 space-y-3">
      <div className="rounded-lg p-3" style={{ border: '1px solid var(--color-bg-border)', background: 'var(--color-bg-card)' }}>
        <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>Path ({path.hops} hops)</p>
        <div className="space-y-1.5">
          {path.path.map((step, i) => {
            const entity = entities[step.entity_id];
            if (!entity) return null;
            const claim = claims[step.claim_id];
            return (
              <p key={`${step.entity_id}-${i}`} className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                <Link href={`/entity/${entity.slug}`} target="_blank" style={{ color: 'var(--color-accent)' }}>{entity.name}</Link>
                {claim ? ` → ${RELATION_META[claim.relation_type]?.label ?? claim.relation_type}: ${claim.description}` : ''}
              </p>
            );
          })}
        </div>
      </div>
      {showNumerology && coincidenceRows.length > 0 && (
        <div className="rounded-lg p-3" style={{ border: '1px solid var(--color-bg-border)', background: 'var(--color-bg-card)' }}>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>Numeric coincidences</p>
          {coincidenceRows.map((item) => (
            <p key={item.value} className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              <span style={{ color: 'var(--color-text-primary)' }}>#{item.value}</span> · {item.names.join(' ↔ ')}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function EmbedProfileTab({ tab, showNumerology }: { tab: TopicTab; showNumerology: boolean }) {
  const [entities, setEntities] = useState<Entity[]>([]);

  useEffect(() => {
    (async () => {
      const ids = getConfigEntityIds(tab);
      if (ids.length === 0) {
        setEntities([]);
        return;
      }
      const sb = createClient();
      const { data } = await sb.from('entities').select('*').in('id', ids);
      const ordered = ids.map(id => (data ?? []).find(e => e.id === id)).filter(Boolean) as Entity[];
      setEntities(ordered);
    })();
  }, [tab.id, JSON.stringify(tab.config)]);

  if (entities.length === 0) return <EmptyEmbedCard message="Set entity_ids to render profiles." />;

  return (
    <div className="h-full overflow-auto p-3 grid gap-2 sm:grid-cols-2">
      {entities.map((entity) => (
        <Link key={entity.id} href={`/entity/${entity.slug}`} target="_blank" className="rounded-lg p-3" style={{ border: '1px solid var(--color-bg-border)', background: 'var(--color-bg-card)' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{entity.name}</p>
          <p className="text-xs capitalize mt-1" style={{ color: 'var(--color-text-muted)' }}>{entity.type}</p>
          {entity.description && <p className="text-xs mt-2" style={{ color: 'var(--color-text-secondary)' }}>{entity.description}</p>}
          {showNumerology && <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>O:{gematria(entity.name).ordinal} · FR:{gematria(entity.name).full_reduction}</p>}
        </Link>
      ))}
    </div>
  );
}

function EmbedListTab({ tab }: { tab: TopicTab }) {
  const [rows, setRows] = useState<ClaimWithEntity[]>([]);

  useEffect(() => {
    (async () => {
      const ids = getConfigEntityIds(tab);
      if (ids.length === 0) {
        setRows([]);
        return;
      }
      const relationFilter = new Set(getConfigRelationTypes(tab));
      const sb = createClient();
      const bundles = await Promise.all(ids.map(async (id) => {
        const { data } = await sb.rpc('entity_claims', { entity_uuid: id, limit_n: 60 });
        return (data ?? []) as ClaimWithEntity[];
      }));
      const dedup = new Map<string, ClaimWithEntity>();
      for (const claim of bundles.flat()) {
        if (relationFilter.size > 0 && !relationFilter.has(claim.relation_type)) continue;
        dedup.set(claim.claim_id, claim);
      }
      setRows([...dedup.values()].slice(0, 100));
    })();
  }, [tab.id, JSON.stringify(tab.config)]);

  if (rows.length === 0) return <EmptyEmbedCard message="No rows. Add entity_ids (and optional filter_types)." />;

  return (
    <div className="h-full overflow-auto p-3 space-y-2">
      {rows.map((claim) => (
        <div key={claim.claim_id} className="rounded-lg p-3" style={{ border: '1px solid var(--color-bg-border)', background: 'var(--color-bg-card)' }}>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {RELATION_META[claim.relation_type]?.icon} {RELATION_META[claim.relation_type]?.label}
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-primary)' }}>{claim.description}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            <Link href={`/entity/${claim.other_entity_slug}`} target="_blank" style={{ color: 'var(--color-accent)' }}>{claim.other_entity_name}</Link>
            {claim.date_start ? ` · ${formatDate(claim.date_start)}` : ''}
          </p>
        </div>
      ))}
    </div>
  );
}

function EmptyEmbedCard({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center p-4" style={{ color: 'var(--color-text-muted)' }}>
      <p className="text-sm text-center">{message}</p>
    </div>
  );
}
