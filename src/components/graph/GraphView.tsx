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
  Handle,
  Position,
  type Connection,
  type Node,
  type Edge,
  MarkerType,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Search, Undo2, Filter, ZoomIn, X, Plus, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Entity, ClaimWithEntity, PathStep, RelationType } from '@/types';
import { RELATION_META } from '@/types';
import { gematria } from '@/lib/numerology';
import { ClaimEdge, type ClaimEdgeData } from './ClaimEdge';

// ── Custom node ──────────────────────────────────────────────
function EntityNode({ data }: { data: { entity: Entity; onExpand: (id: string) => void; onDelete?: (id: string) => void } }) {
  const { entity, onExpand, onDelete } = data;
  const typeColor = entity.type === 'person' ? '#6366f1' : entity.type === 'organization' ? '#a855f7' : '#f59e0b';

  return (
    <div style={{ position: 'relative' }}>
      <Handle type="target" position={Position.Left} style={{ background: typeColor, border: 'none', width: 8, height: 8 }} />
      <Handle type="source" position={Position.Right} style={{ background: typeColor, border: 'none', width: 8, height: 8 }} />
      <div
        className="transition-all hover:scale-105"
        style={{
          background: '#16162a',
          border: `2px solid ${typeColor}40`,
          borderRadius: '12px',
          padding: '10px 14px',
          minWidth: '140px',
          maxWidth: '180px',
          boxShadow: `0 0 16px ${typeColor}20`,
          cursor: 'pointer',
        }}
      >
        {/* Delete button */}
        <button
          onClick={e => { e.stopPropagation(); onDelete?.(entity.id); }}
          className="nodrag"
          style={{
            position: 'absolute', top: -8, right: -8,
            width: 18, height: 18, borderRadius: '50%',
            background: '#ef4444', border: '2px solid #16162a',
            color: '#fff', fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', zIndex: 10, lineHeight: 1,
          }}
          title="Remove from view"
        >×</button>

        <div className="flex items-center gap-2" onClick={() => onExpand(entity.id)}>
          <div
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: `${typeColor}25`,
              border: `1px solid ${typeColor}40`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', color: typeColor, fontWeight: 700, flexShrink: 0,
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
    </div>
  );
}

const nodeTypes = { entity: EntityNode };
const edgeTypes = { claim: ClaimEdge };

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
          onExpand: () => {}, onDelete: () => {},
        },
      });
      existing.add(eid);
    }

    const edgeId = `${center.id}-${eid}-${conn.claim_id}`;
    newEdges.push({
      id: edgeId,
      source: center.id,
      target: eid,
      type: 'claim',
      style: { stroke: meta.color, strokeWidth: 1.5, opacity: 0.8 },
      markerEnd: { type: MarkerType.ArrowClosed, color: meta.color, width: 12, height: 12 },
      data: {
        relation_type: conn.relation_type,
        claim_id: conn.claim_id,
        description: conn.description,
        source_url: conn.source_url,
        source_domain: conn.source_domain ?? undefined,
      } satisfies ClaimEdgeData,
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
  const [pathFromQuery, setPathFromQuery] = useState('');
  const [pathToQuery, setPathToQuery] = useState('');
  const [pathFromResults, setPathFromResults] = useState<Entity[]>([]);
  const [pathToResults, setPathToResults] = useState<Entity[]>([]);
  const pathFromTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pathToTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [pathLoading, setPathLoading] = useState(false);
  const [starLoading, setStarLoading] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<ClaimEdgeData | null>(null);
  const [showPathPanel, setShowPathPanel] = useState(false);
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

  const deleteNode = useCallback((nodeId: string) => {
    saveHistory();
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setEdges(prev => prev.filter(e => e.source !== nodeId && e.target !== nodeId));
  }, [saveHistory, setNodes, setEdges]);

  const deleteEdge = useCallback((edgeId: string) => {
    saveHistory();
    setEdges(prev => prev.filter(e => e.id !== edgeId));
  }, [saveHistory, setEdges]);

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

      // Inject onExpand + onDelete into all new nodes
      const withExpand = newNodes.map(n => ({
        ...n,
        data: { ...n.data, onExpand: expandEntity, onDelete: deleteNode },
      }));

      setNodes(prev => {
        const existing = new Set(prev.map(n => n.id));
        return [...prev, ...withExpand.filter(n => !existing.has(n.id))];
      });
      setEdges(prev => {
        const existing = new Set(prev.map(e => e.id));
        const withSelect = newEdges
          .filter(e => !existing.has(e.id))
          .map(e => ({ ...e, data: { ...e.data, onSelect: setSelectedClaim } }));
        return [...prev, ...withSelect];
      });
    } finally {
      setLoadingId(null);
    }
  }, [nodes, edges, filterType, loadingId, saveHistory, setNodes, setEdges, deleteNode]);

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

  // Path-from search
  useEffect(() => {
    if (!pathFromQuery.trim()) { setPathFromResults([]); return; }
    clearTimeout(pathFromTimer.current);
    pathFromTimer.current = setTimeout(async () => {
      const sb = createClient();
      const { data } = await sb.from('entities').select('*').eq('is_public', true).ilike('name', `%${pathFromQuery}%`).limit(6);
      setPathFromResults((data ?? []) as Entity[]);
    }, 250);
  }, [pathFromQuery]);

  // Path-to search
  useEffect(() => {
    if (!pathToQuery.trim()) { setPathToResults([]); return; }
    clearTimeout(pathToTimer.current);
    pathToTimer.current = setTimeout(async () => {
      const sb = createClient();
      const { data } = await sb.from('entities').select('*').eq('is_public', true).ilike('name', `%${pathToQuery}%`).limit(6);
      setPathToResults((data ?? []) as Entity[]);
    }, 250);
  }, [pathToQuery]);

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
        data: { entity, onExpand: expandEntity, onDelete: deleteNode },
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
            data: { entity, onExpand: expandEntity, onDelete: deleteNode },
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
      const allPaths: PathStep[][] = json.paths ?? (json.path?.path ? [json.path.path] : []);
      if (allPaths.length === 0) return;
      const claimMap: Record<string, { id: string; relation_type: RelationType; description: string; source_url: string; source_domain: string | null }> = json.claimMap ?? {};

      const allEntityIds = [...new Set(allPaths.flat().map(s => s.entity_id))];
      const sb = createClient();
      const { data: entitiesData } = await sb.from('entities').select('*').in('id', allEntityIds);
      const entityMap = Object.fromEntries((entitiesData ?? []).map(e => [e.id, e as Entity]));

      // Lay out all unique entities in a grid (rows = paths, cols = steps)
      const newNodes: Node[] = [];
      const seenNodes = new Set<string>();
      allPaths.forEach((pathSteps, pathIdx) => {
        const unique = [...new Set(pathSteps.map(s => s.entity_id))];
        unique.forEach((id, stepIdx) => {
          if (seenNodes.has(id)) return;
          seenNodes.add(id);
          const entity = entityMap[id];
          if (!entity) return;
          newNodes.push({
            id, type: 'entity',
            position: { x: stepIdx * 260, y: pathIdx * 180 },
            data: { entity, onExpand: expandEntity, onDelete: deleteNode },
          } as Node);
        });
      });

      const newEdges: Edge[] = [];
      const seenEdges = new Set<string>();
      allPaths.forEach((pathSteps, pathIdx) => {
        for (let i = 0; i < pathSteps.length - 1; i++) {
          const sourceId = pathSteps[i].entity_id;
          const targetId = pathSteps[i + 1].entity_id;
          const claim = claimMap[pathSteps[i].claim_id];
          const relType = (claim?.relation_type ?? 'other') as RelationType;
          const meta = RELATION_META[relType];
          const edgeId = pathSteps[i].claim_id
            ? `claim-${pathSteps[i].claim_id}`
            : `path${pathIdx}-${sourceId}-${targetId}-${i}`;
          if (seenEdges.has(edgeId)) continue;
          seenEdges.add(edgeId);
          newEdges.push({
            id: edgeId,
            source: sourceId,
            target: targetId,
            type: 'claim',
            style: { stroke: meta.color, strokeWidth: 2, opacity: 0.9 },
            markerEnd: { type: MarkerType.ArrowClosed, color: meta.color, width: 12, height: 12 },
            data: {
              relation_type: relType,
              claim_id: pathSteps[i].claim_id,
              description: claim?.description,
              source_url: claim?.source_url,
              source_domain: claim?.source_domain ?? undefined,
              onSelect: setSelectedClaim,
            } satisfies ClaimEdgeData,
          });
        }
      });

      setNodes(prev => {
        const map = new Map(prev.map(n => [n.id, n]));
        for (const n of newNodes) if (!map.has(n.id)) map.set(n.id, n);
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
        edgeTypes={edgeTypes}
        onEdgeDoubleClick={(_evt, edge) => deleteEdge(edge.id)}
        fitView
        minZoom={0.2}
        maxZoom={3}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#2a2a40" />
        <Controls showInteractive={false} />
        <div className="hidden sm:block">
          <MiniMap
            nodeColor={(n) => {
              const type = (n.data?.entity as Entity)?.type;
              return type === 'person' ? '#6366f1' : type === 'organization' ? '#a855f7' : '#f59e0b';
            }}
            maskColor="rgba(8,8,14,0.7)"
          />
        </div>

        {/* Top panel: search + undo + filter */}
        <Panel position="top-left">
          <div className="space-y-2">
            {/* Search */}
            <div className="relative">
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-bg-border)', width: 'min(260px, calc(100vw - 32px))' }}
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
            <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-bg-border)', width: 'min(260px, calc(100vw - 32px))' }}>
              <button
                onClick={() => setShowPathPanel(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-[11px] uppercase tracking-wider font-semibold"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Import path between two entities
                <span style={{ fontSize: 10 }}>{showPathPanel ? '▲' : '▼'}</span>
              </button>
            <div className={`space-y-2 px-2 pb-2 ${showPathPanel ? '' : 'hidden'}`}>
              <div className="relative">
                <input
                  value={pathFrom ? pathFrom.name : pathFromQuery}
                  onChange={(e) => {
                    setPathFrom(null);
                    setPathFromQuery(e.target.value);
                  }}
                  placeholder="From entity…"
                  className="input text-xs"
                />
                {pathFromResults.length > 0 && !pathFrom && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg overflow-hidden shadow-lg"
                    style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-bg-border)' }}>
                    {pathFromResults.map(e => (
                      <button key={e.id} className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-bg-hover)] transition-colors"
                        style={{ color: 'var(--color-text-primary)' }}
                        onMouseDown={() => { setPathFrom(e); setPathFromQuery(''); setPathFromResults([]); }}>
                        {e.name}
                        <span className="ml-1.5 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{e.type}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <input
                  value={pathTo ? pathTo.name : pathToQuery}
                  onChange={(e) => {
                    setPathTo(null);
                    setPathToQuery(e.target.value);
                  }}
                  placeholder="To entity…"
                  className="input text-xs"
                />
                {pathToResults.length > 0 && !pathTo && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg overflow-hidden shadow-lg"
                    style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-bg-border)' }}>
                    {pathToResults.map(e => (
                      <button key={e.id} className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-bg-hover)] transition-colors"
                        style={{ color: 'var(--color-text-primary)' }}
                        onMouseDown={() => { setPathTo(e); setPathToQuery(''); setPathToResults([]); }}>
                        {e.name}
                        <span className="ml-1.5 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{e.type}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={importPathBetweenEntities}
                disabled={!pathFrom || !pathTo || pathLoading}
                className="btn-primary w-full justify-center text-xs"
              >
                {pathLoading ? 'Importing…' : 'Import path'}
              </button>
            </div>
            </div>

            {/* Undo + Filter buttons */}
            <div className="flex flex-wrap gap-2" style={{ maxWidth: 'min(400px, calc(100vw - 32px))' }}>
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
              <button
                onClick={() => { saveHistory(); setNodes([]); setEdges([]); }}
                disabled={nodes.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-colors"
                style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-bg-border)', color: 'var(--color-danger)', opacity: nodes.length === 0 ? 0.4 : 1 }}
              >
                <X size={12} /> Clear all
              </button>
            </div>

            {/* Filter panel */}
            {showFilters && (
              <div
                className="rounded-xl p-3 space-y-1.5"
                style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-bg-border)', width: 'min(280px, calc(100vw - 32px))' }}
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

        {/* Empty state — bottom-center so it never overlaps the search panel */}
        {nodes.length === 0 && (
          <Panel position="bottom-center">
            <div className="text-center mb-8 space-y-1 pointer-events-none">
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
                Search above to add entities · click a node to expand connections
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

      {/* Claim detail sidebar */}
      {selectedClaim && (() => {
        const meta = RELATION_META[selectedClaim.relation_type];
        return (
          <div
            style={{
              position: 'absolute', top: 0, right: 0, bottom: 0,
              width: 'min(280px, 100vw)', zIndex: 20,
              background: 'var(--color-bg-card)',
              borderLeft: '1px solid var(--color-bg-border)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--color-bg-border)' }}>
              <div className="flex items-center gap-2">
                <span>{meta.icon}</span>
                <span className="text-sm font-semibold" style={{ color: meta.color }}>{meta.label}</span>
              </div>
              <button onClick={() => setSelectedClaim(null)} style={{ color: 'var(--color-text-muted)' }} className="hover:text-[var(--color-text-primary)]">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto space-y-4">
              {selectedClaim.description && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>Description</p>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>{selectedClaim.description}</p>
                </div>
              )}
              {selectedClaim.source_url && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>Source</p>
                  <a
                    href={selectedClaim.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm hover:underline"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    <ExternalLink size={12} />
                    {selectedClaim.source_domain ?? selectedClaim.source_url}
                  </a>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
