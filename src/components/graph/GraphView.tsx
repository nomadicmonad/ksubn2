'use client';

import { useCallback, useState, useRef, useEffect } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  MarkerType,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Search, Undo2, Filter, ZoomIn, X, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Entity, ClaimWithEntity, PathStep, RelationType } from '@/types';
import { RELATION_META } from '@/types';
import { gematria } from '@/lib/numerology';

// ── Custom node ──────────────────────────────────────────────
function EntityNode({ data }: { data: { entity: Entity; onExpand: (id: string) => void } }) {
  const { entity, onExpand } = data;
  const typeColor = entity.type === 'person' ? '#6366f1' : entity.type === 'organization' ? '#a855f7' : '#f59e0b';

  return (
    <div
      onClick={() => onExpand(entity.id)}
      className="cursor-pointer transition-all hover:scale-105"
      style={{
        background: '#16162a',
        border: `2px solid ${typeColor}40`,
        borderRadius: '12px',
        padding: '10px 14px',
        minWidth: '140px',
        maxWidth: '180px',
        boxShadow: `0 0 16px ${typeColor}20`,
      }}
    >
      <div className="flex items-center gap-2">
        <div
          style={{
            width: 28, height: 28, borderRadius: '50%',
            background: `${typeColor}25`,
            border: `1px solid ${typeColor}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', color: typeColor, fontWeight: 700,
          }}
        >
          {entity.name[0]}
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ color: '#e8e8f4', fontSize: '12px', fontWeight: 600, lineHeight: 1.2 }} className="truncate">
            {entity.name}
          </p>
          <p style={{ color: typeColor, fontSize: '10px', textTransform: 'capitalize' }}>{entity.type}</p>
        </div>
      </div>
    </div>
  );
}

const nodeTypes = { entity: EntityNode };

// ── Graph layout: simple radial ───────────────────────────────
function layoutNodes(center: Entity, connections: ClaimWithEntity[], existingNodes: Node[]): { nodes: Node[]; edges: Edge[] } {
  const existing = new Set(existingNodes.map(n => n.id));
  const newNodes: Node[] = [];
  const newEdges: Edge[] = [];
  const angleStep = (2 * Math.PI) / Math.max(connections.length, 1);
  const radius = 220;

  // Get center node position
  const centerNode = existingNodes.find(n => n.id === center.id);
  const cx = centerNode?.position.x ?? 0;
  const cy = centerNode?.position.y ?? 0;

  connections.forEach((conn, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const eid = conn.other_entity_id;
    const meta = RELATION_META[conn.relation_type];

    if (!existing.has(eid)) {
      newNodes.push({
        id: eid,
        type: 'entity',
        position: { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius },
        data: {
          entity: {
            id: eid, slug: conn.other_entity_slug, name: conn.other_entity_name,
            type: conn.other_entity_type, image_url: conn.other_entity_image,
          } as Entity,
          onExpand: () => {},
        },
      });
      existing.add(eid);
    }

    const edgeId = `${center.id}-${eid}-${conn.claim_id}`;
    newEdges.push({
      id: edgeId,
      source: center.id,
      target: eid,
      type: 'smoothstep',
      animated: false,
      label: meta.icon,
      labelStyle: { fontSize: 14 },
      style: { stroke: meta.color, strokeWidth: 1.5, opacity: 0.7 },
      markerEnd: { type: MarkerType.ArrowClosed, color: meta.color, width: 12, height: 12 },
      data: { relation_type: conn.relation_type, claim_id: conn.claim_id },
    });
  });

  return { nodes: newNodes, edges: newEdges };
}

const FILTER_ALL = 'all';

interface GraphViewProps {
  showNumerologyOverride?: boolean;
  /** Entity IDs to pre-load on mount (used by topic tabs) */
  initialEntityIds?: string[];
  /** Called whenever the set of entity IDs in the graph changes */
  onEntityIdsChange?: (ids: string[]) => void;
  /** Entity slugs to pre-load via slug lookup (used by URL deep links) */
  initialSlugs?: string[];
}

export function GraphView({
  showNumerologyOverride,
  initialEntityIds,
  onEntityIdsChange,
  initialSlugs,
}: GraphViewProps = {}) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Entity[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>(FILTER_ALL);
  const [showFilters, setShowFilters] = useState(false);
  const [pathFrom, setPathFrom] = useState<Entity | null>(null);
  const [pathTo, setPathTo] = useState<Entity | null>(null);
  const [pathLoading, setPathLoading] = useState(false);
  const [starLoading, setStarLoading] = useState(false);
  const [showNumerology, setShowNumerology] = useState(true);
  const [initialised, setInitialised] = useState(false);
  const history = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (typeof showNumerologyOverride === 'boolean') {
      setShowNumerology(showNumerologyOverride);
      return;
    }
    (async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single();
      if (profile && 'show_numerology' in profile && profile.show_numerology === false) setShowNumerology(false);
    })();
  }, [showNumerologyOverride]);

  const saveHistory = useCallback(() => {
    history.current.push({ nodes: [...nodes], edges: [...edges] });
    if (history.current.length > 20) history.current.shift();
  }, [nodes, edges]);

  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (prev) { setNodes(prev.nodes); setEdges(prev.edges); }
  }, [setNodes, setEdges]);

  const expandEntity = useCallback(async (entityId: string) => {
    if (loadingId) return;
    setLoadingId(entityId);
    saveHistory();

    try {
      const sb = createClient();
      const [{ data: entityData }, { data: claimsData }] = await Promise.all([
        sb.from('entities').select('*').eq('id', entityId).single(),
        sb.rpc('entity_claims', { entity_uuid: entityId, limit_n: 30 }),
      ]);

      if (!entityData) return;
      const entity = entityData as Entity;
      const claims = (claimsData ?? []) as ClaimWithEntity[];

      // Filter by relation type if active
      const filtered = filterType === FILTER_ALL ? claims : claims.filter(c => c.relation_type === filterType);

      const { nodes: newNodes, edges: newEdges } = layoutNodes(entity, filtered, nodes);

      // Inject onExpand into all new nodes
      const withExpand = newNodes.map(n => ({
        ...n,
        data: { ...n.data, onExpand: expandEntity },
      }));

      setNodes(prev => {
        const existing = new Set(prev.map(n => n.id));
        return [...prev, ...withExpand.filter(n => !existing.has(n.id))];
      });
      setEdges(prev => {
        const existing = new Set(prev.map(e => e.id));
        return [...prev, ...newEdges.filter(e => !existing.has(e.id))];
      });
    } finally {
      setLoadingId(null);
    }
  }, [nodes, edges, filterType, loadingId, saveHistory, setNodes, setEdges]);

  // Load initial entities from props (topic tab config or URL slugs)
  useEffect(() => {
    if (initialised) return;
    setInitialised(true);
    const ids = initialEntityIds ?? [];
    const slugs = initialSlugs ?? [];
    if (ids.length === 0 && slugs.length === 0) return;

    (async () => {
      const sb = createClient();
      let entities: Entity[] = [];

      if (ids.length > 0) {
        const { data } = await sb.from('entities').select('*').in('id', ids);
        entities = (data ?? []) as Entity[];
      }
      if (slugs.length > 0) {
        const { data } = await sb.from('entities').select('*').in('slug', slugs);
        const extra = (data ?? []) as Entity[];
        const existingIds = new Set(entities.map(e => e.id));
        entities = [...entities, ...extra.filter(e => !existingIds.has(e.id))];
      }

      for (const entity of entities) {
        await expandEntity(entity.id);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Notify parent when node set changes (for topic tab config persistence)
  useEffect(() => {
    if (!onEntityIdsChange || !initialised) return;
    const ids = nodes.map(n => n.id);
    onEntityIdsChange(ids);
  }, [nodes, onEntityIdsChange, initialised]);

  // Entity search
  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return; }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      const sb = createClient();
      const { data } = await sb.from('entities').select('*').eq('is_public', true).ilike('name', `%${search}%`).limit(6);
      setSearchResults((data ?? []) as Entity[]);
    }, 250);
  }, [search]);

  async function addEntityToGraph(entity: Entity) {
    setSearch('');
    setSearchResults([]);
    saveHistory();

    // Add center node if not present
    setNodes(prev => {
      if (prev.find(n => n.id === entity.id)) return prev;
      return [...prev, {
        id: entity.id,
        type: 'entity',
        position: { x: Math.random() * 400 - 200, y: Math.random() * 400 - 200 },
        data: { entity, onExpand: expandEntity },
      }];
    });
    await expandEntity(entity.id);
  }

  async function importStarredEntities() {
    if (starLoading) return;
    setStarLoading(true);
    saveHistory();
    try {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data: stars } = await sb.from('stars').select('entity_id').eq('user_id', user.id).not('entity_id', 'is', null).limit(20);
      const entityIds = [...new Set((stars ?? []).map(s => s.entity_id).filter(Boolean) as string[])];
      if (entityIds.length === 0) return;
      const { data: entitiesData } = await sb.from('entities').select('*').in('id', entityIds).eq('is_public', true);
      const entities = (entitiesData ?? []) as Entity[];
      for (const entity of entities.slice(0, 8)) {
        setNodes(prev => {
          if (prev.find(n => n.id === entity.id)) return prev;
          return [...prev, {
            id: entity.id,
            type: 'entity',
            position: { x: Math.random() * 500 - 250, y: Math.random() * 400 - 200 },
            data: { entity, onExpand: expandEntity },
          }];
        });
      }
      for (const entity of entities.slice(0, 8)) {
        await expandEntity(entity.id);
      }
    } finally {
      setStarLoading(false);
    }
  }

  async function importPathBetweenEntities() {
    if (!pathFrom || !pathTo) return;
    setPathLoading(true);
    saveHistory();
    try {
      const res = await fetch('/api/paths/compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_entity: pathFrom.id, to_entity: pathTo.id, max_hops: 4 }),
      });
      const json = await res.json();
      if (!json.path?.path) return;
      const pathSteps = json.path.path as PathStep[];
      const entityIds = [...new Set(pathSteps.map(s => s.entity_id))];
      const claimIds = [...new Set(pathSteps.map(s => s.claim_id).filter(Boolean))];
      const sb = createClient();
      const [{ data: entitiesData }, { data: claimsData }] = await Promise.all([
        sb.from('entities').select('*').in('id', entityIds),
        sb.from('claims').select('id, relation_type, description').in('id', claimIds),
      ]);
      const entityMap = Object.fromEntries((entitiesData ?? []).map(e => [e.id, e as Entity]));
      const claimMap = Object.fromEntries((claimsData ?? []).map(c => [c.id, c]));

      const pathEntityOrder = pathSteps.map(step => step.entity_id);
      const uniqueInOrder = pathEntityOrder.filter((id, idx) => pathEntityOrder.indexOf(id) === idx);

      const newNodes: Node[] = uniqueInOrder
        .map((id, i) => {
          const entity = entityMap[id];
          if (!entity) return null;
          return {
            id,
            type: 'entity',
            position: { x: i * 220, y: 0 },
            data: { entity, onExpand: expandEntity },
          } as Node;
        })
        .filter(Boolean) as Node[];

      const newEdges: Edge[] = [];
      for (let i = 0; i < pathSteps.length - 1; i++) {
        const sourceId = pathSteps[i].entity_id;
        const targetId = pathSteps[i + 1].entity_id;
        const claim = claimMap[pathSteps[i].claim_id];
        if (!claim) continue;
        const meta = RELATION_META[claim.relation_type as RelationType];
        newEdges.push({
          id: `${sourceId}-${targetId}-${pathSteps[i].claim_id}`,
          source: sourceId,
          target: targetId,
          type: 'smoothstep',
          label: meta.icon,
          labelStyle: { fontSize: 14 },
          style: { stroke: meta.color, strokeWidth: 2, opacity: 0.8 },
          markerEnd: { type: MarkerType.ArrowClosed, color: meta.color, width: 12, height: 12 },
          data: { relation_type: claim.relation_type, claim_id: pathSteps[i].claim_id },
        });
      }

      setNodes(prev => {
        const map = new Map(prev.map(n => [n.id, n]));
        for (const n of newNodes) map.set(n.id, map.has(n.id) ? map.get(n.id)! : n);
        return [...map.values()];
      });
      setEdges(prev => {
        const map = new Map(prev.map(e => [e.id, e]));
        for (const e of newEdges) map.set(e.id, e);
        return [...map.values()];
      });
    } finally {
      setPathLoading(false);
    }
  }

  const visibleEdges = filterType === FILTER_ALL
    ? edges
    : edges.filter(e => e.data?.relation_type === filterType);

  const numericCoincidences = (() => {
    if (!showNumerology || nodes.length < 2) return [] as Array<{ value: number; entities: string[] }>;
    const buckets = new Map<number, string[]>();
    for (const node of nodes) {
      const entity = node.data?.entity as Entity | undefined;
      if (!entity?.name) continue;
      for (const value of Object.values(gematria(entity.name))) {
        const names = buckets.get(value) ?? [];
        if (!names.includes(entity.name)) names.push(entity.name);
        buckets.set(value, names);
      }
    }
    return [...buckets.entries()]
      .filter(([, names]) => names.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 8)
      .map(([value, entities]) => ({ value, entities }));
  })();

  return (
    <div style={{ height: 'calc(100vh - 56px)', position: 'relative', background: 'var(--color-bg-base)' }}>
      <ReactFlow
        nodes={nodes}
        edges={visibleEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.2}
        maxZoom={3}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#2a2a40" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(n) => {
            const type = (n.data?.entity as Entity)?.type;
            return type === 'person' ? '#6366f1' : type === 'organization' ? '#a855f7' : '#f59e0b';
          }}
          maskColor="rgba(8,8,14,0.7)"
        />

        {/* Top panel: search + undo + filter */}
        <Panel position="top-left">
          <div className="space-y-2">
            {/* Search */}
            <div className="relative">
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-bg-border)', minWidth: '260px' }}
              >
                <Search size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Add entity to graph…"
                  className="flex-1 bg-transparent text-sm focus:outline-none"
                  style={{ color: 'var(--color-text-primary)' }}
                />
                {loadingId && <div className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />}
              </div>

              {searchResults.length > 0 && (
                <div
                  className="absolute top-full left-0 w-full mt-1 rounded-xl overflow-hidden shadow-lg z-10"
                  style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-bg-border)' }}
                >
                  {searchResults.map(e => (
                    <button
                      key={e.id}
                      onClick={() => addEntityToGraph(e)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-bg-hover)] transition-colors"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      <span className="font-medium">{e.name}</span>
                      <span className="ml-2 text-xs capitalize" style={{ color: 'var(--color-text-muted)' }}>{e.type}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Source -> target path import */}
            <div className="rounded-xl p-2 space-y-2" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-bg-border)', minWidth: '260px' }}>
              <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                Import graph between two entities
              </p>
              <div className="relative">
                <input
                  value={pathFrom?.name ?? ''}
                  onChange={async (e) => {
                    const q = e.target.value;
                    if (!q.trim()) { setPathFrom(null); return; }
                    const sb = createClient();
                    const { data } = await sb.from('entities').select('*').eq('is_public', true).ilike('name', `%${q}%`).limit(1);
                    setPathFrom(((data ?? [])[0] as Entity) ?? null);
                  }}
                  placeholder="From entity (type name)"
                  className="input text-xs"
                />
              </div>
              <div className="relative">
                <input
                  value={pathTo?.name ?? ''}
                  onChange={async (e) => {
                    const q = e.target.value;
                    if (!q.trim()) { setPathTo(null); return; }
                    const sb = createClient();
                    const { data } = await sb.from('entities').select('*').eq('is_public', true).ilike('name', `%${q}%`).limit(1);
                    setPathTo(((data ?? [])[0] as Entity) ?? null);
                  }}
                  placeholder="To entity (type name)"
                  className="input text-xs"
                />
              </div>
              <button
                onClick={importPathBetweenEntities}
                disabled={!pathFrom || !pathTo || pathLoading}
                className="btn-primary w-full justify-center text-xs"
              >
                {pathLoading ? 'Importing…' : 'Import path'}
              </button>
            </div>

            {/* Undo + Filter buttons */}
            <div className="flex gap-2">
              <button
                onClick={undo}
                disabled={history.current.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-colors"
                style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-bg-border)', color: 'var(--color-text-secondary)', opacity: history.current.length === 0 ? 0.4 : 1 }}
              >
                <Undo2 size={12} /> Undo
              </button>
              <button
                onClick={() => setShowFilters(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-colors"
                style={{ background: showFilters ? 'var(--color-accent-dim)' : 'var(--color-bg-card)', border: `1px solid ${showFilters ? 'rgba(99,102,241,0.4)' : 'var(--color-bg-border)'}`, color: showFilters ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}
              >
                <Filter size={12} /> Filter
              </button>
              <button
                onClick={importStarredEntities}
                disabled={starLoading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-colors"
                style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-bg-border)', color: 'var(--color-text-secondary)' }}
              >
                <Plus size={12} /> {starLoading ? 'Loading…' : 'Import starred'}
              </button>
            </div>

            {/* Filter panel */}
            {showFilters && (
              <div
                className="rounded-xl p-3 space-y-1.5"
                style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-bg-border)', minWidth: '220px' }}
              >
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>
                  Relation type
                </p>
                <button
                  onClick={() => setFilterType(FILTER_ALL)}
                  className="w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors"
                  style={{ background: filterType === FILTER_ALL ? 'var(--color-bg-hover)' : 'transparent', color: 'var(--color-text-secondary)' }}
                >
                  All connections
                </button>
                {(Object.entries(RELATION_META) as [RelationType, (typeof RELATION_META)[RelationType]][]).map(([type, meta]) => (
                  <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    className="w-full text-left px-2 py-1.5 rounded-lg text-xs flex items-center gap-2 transition-colors"
                    style={{
                      background: filterType === type ? `${meta.color}15` : 'transparent',
                      color: filterType === type ? meta.color : 'var(--color-text-secondary)',
                    }}
                  >
                    <span>{meta.icon}</span> {meta.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Panel>

        {/* Empty state */}
        {nodes.length === 0 && (
          <Panel position="top-center">
            <div className="text-center mt-20 space-y-2">
              <p className="text-lg font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                Search for an entity to start exploring
              </p>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Click any node to expand its connections
              </p>
            </div>
          </Panel>
        )}

        {showNumerology && numericCoincidences.length > 0 && (
          <Panel position="top-right">
            <div className="rounded-xl p-3 space-y-2 max-w-[320px]" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-bg-border)' }}>
              <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                Numeric coincidences
              </p>
              {numericCoincidences.map((item) => (
                <div key={item.value} className="rounded-lg px-2 py-1.5 text-xs" style={{ background: 'var(--color-bg-hover)' }}>
                  <span style={{ color: 'var(--color-text-primary)' }}>#{item.value}</span>
                  <span style={{ color: 'var(--color-text-muted)' }}> · {item.entities.join(', ')}</span>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}
