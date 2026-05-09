'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Globe, Lock, Share2, Pencil, Trash2, BarChart2, Network, Clock, List, GitBranch } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { GraphView } from '@/components/graph/GraphView';
import { StarToggleButton } from '@/components/entity/StarToggleButton';
import type { ClaimWithEntity, Entity, PathStep, RelationType, Topic, TopicTab, TabViewType } from '@/types';
import { RELATION_META } from '@/types';
import { formatDate } from '@/lib/utils';
import { gematria, numerologyValuesForEntity } from '@/lib/numerology';

const TAB_ICONS: Record<TabViewType, React.ComponentType<{ size: number }>> = {
  graph:       Network,
  timeline:    Clock,
  profile:     BarChart2,
  connections: GitBranch,
  list:        List,
};

export default function TopicPage() {
  const { id } = useParams();
  const router = useRouter();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [tabs, setTabs] = useState<TopicTab[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [isOwner, setIsOwner] = useState(false);
  const [accountRestricted, setAccountRestricted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [addingTab, setAddingTab] = useState(false);
  const [newTabTitle, setNewTabTitle] = useState('');
  const [newTabType, setNewTabType] = useState<TabViewType>('graph');
  const [copied, setCopied] = useState(false);
  const [topicStarred, setTopicStarred] = useState(false);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [editingTab, setEditingTab] = useState(false);
  const [editTabTitle, setEditTabTitle] = useState('');
  const [editTabType, setEditTabType] = useState<TabViewType>('graph');
  const [editTabConfig, setEditTabConfig] = useState('{}');
  const [saveTabError, setSaveTabError] = useState('');
  const [configEntitySearch, setConfigEntitySearch] = useState('');
  const [configEntityOptions, setConfigEntityOptions] = useState<Entity[]>([]);
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [selectedEntities, setSelectedEntities] = useState<Record<string, Entity>>({});
  const [selectedRelationTypes, setSelectedRelationTypes] = useState<RelationType[]>([]);
  const [fromEntityId, setFromEntityId] = useState('');
  const [toEntityId, setToEntityId] = useState('');
  const [loadingStarredEntities, setLoadingStarredEntities] = useState(false);
  const entitySearchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();

      const [{ data: topicData }, { data: tabsData }] = await Promise.all([
        sb.from('topics').select('*').eq('id', id).single(),
        sb.from('topic_tabs').select('*').eq('topic_id', id).order('position'),
      ]);

      if (!topicData) { router.push('/topics'); return; }
      setTopic(topicData as Topic);
      setTabs((tabsData ?? []) as TopicTab[]);
      let owner = user?.id === topicData.user_id;
      if (owner && user) {
        const { data: profile } = await sb.from('profiles').select('is_banned').eq('id', user.id).single();
        const restricted = profile?.is_banned === true;
        setAccountRestricted(restricted);
        if (restricted) owner = false;
      }
      setIsOwner(owner);
      if (user) {
        const { data: star } = await sb.from('stars').select('id').eq('user_id', user.id).eq('topic_id', topicData.id).maybeSingle();
        setTopicStarred(!!star);
      }

      // Increment view count
      if (user?.id !== topicData.user_id) {
        await sb.from('topics').update({ views: (topicData.views ?? 0) + 1 }).eq('id', id);
      }

      setLoading(false);
    })();
  }, [id]);

  async function addTab() {
    if (accountRestricted) return;
    if (!newTabTitle.trim()) return;
    const sb = createClient();
    const { data } = await sb.from('topic_tabs').insert({
      topic_id: id,
      title: newTabTitle.trim(),
      view_type: newTabType,
      position: tabs.length,
    }).select().single();
    if (data) {
      setTabs(prev => [...prev, data as TopicTab]);
      setActiveTab(tabs.length);
    }
    setAddingTab(false);
    setNewTabTitle('');
  }

  async function togglePublic() {
    if (accountRestricted) return;
    if (!topic) return;
    const sb = createClient();
    const { data } = await sb.from('topics').update({ is_public: !topic.is_public }).eq('id', id).select().single();
    if (data) setTopic(data as Topic);
  }

  async function deleteTab(tabId: string) {
    if (accountRestricted) return;
    const sb = createClient();
    await sb.from('topic_tabs').delete().eq('id', tabId);
    setTabs(prev => prev.filter(t => t.id !== tabId));
    setActiveTab(0);
  }

  async function persistTabOrder(nextTabs: TopicTab[]) {
    const sb = createClient();
    setSavingOrder(true);
    try {
      const updates = nextTabs.map((tab, index) =>
        sb.from('topic_tabs').update({ position: index }).eq('id', tab.id),
      );
      await Promise.all(updates);
    } finally {
      setSavingOrder(false);
    }
  }

  function moveTab(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    const currentIndex = tabs.findIndex(t => t.id === draggedId);
    const targetIndex = tabs.findIndex(t => t.id === targetId);
    if (currentIndex < 0 || targetIndex < 0) return;

    const nextTabs = [...tabs];
    const [dragged] = nextTabs.splice(currentIndex, 1);
    nextTabs.splice(targetIndex, 0, dragged);
    setTabs(nextTabs);

    const previousActive = tabs[activeTab];
    const nextActiveIndex = nextTabs.findIndex(t => t.id === previousActive?.id);
    setActiveTab(nextActiveIndex >= 0 ? nextActiveIndex : 0);
    persistTabOrder(nextTabs);
  }

  async function saveCurrentTabConfig() {
    if (accountRestricted) return;
    if (!currentTab) return;
    setSaveTabError('');
    let parsedConfig: Record<string, unknown>;
    try {
      parsedConfig = JSON.parse(editTabConfig || '{}');
    } catch {
      setSaveTabError('Config must be valid JSON');
      return;
    }
    const sb = createClient();
    const { data, error } = await sb.from('topic_tabs').update({
      title: editTabTitle.trim() || currentTab.title,
      view_type: editTabType,
      config: parsedConfig,
    }).eq('id', currentTab.id).select().single();
    if (error) {
      setSaveTabError(error.message);
      return;
    }
    setTabs(prev => prev.map(t => t.id === currentTab.id ? (data as TopicTab) : t));
    setEditingTab(false);
  }

  function syncJsonFromHelpers(next: {
    ids?: string[];
    rels?: RelationType[];
    from?: string;
    to?: string;
  }) {
    const ids = next.ids ?? selectedEntityIds;
    const rels = next.rels ?? selectedRelationTypes;
    const from = next.from ?? fromEntityId;
    const to = next.to ?? toEntityId;
    const base: Record<string, unknown> = {};
    if (ids.length > 0) base.entity_ids = ids;
    if (rels.length > 0) base.filter_types = rels;
    if (from) base.from_entity = from;
    if (to) base.to_entity = to;
    setEditTabConfig(JSON.stringify(base, null, 2));
  }

  function toggleRelationType(type: RelationType) {
    const next = selectedRelationTypes.includes(type)
      ? selectedRelationTypes.filter(t => t !== type)
      : [...selectedRelationTypes, type];
    setSelectedRelationTypes(next);
    syncJsonFromHelpers({ rels: next });
  }

  function addEntityToConfig(entity: Entity) {
    if (selectedEntityIds.includes(entity.id) || selectedEntityIds.length >= 5) return;
    const nextIds = [...selectedEntityIds, entity.id];
    setSelectedEntityIds(nextIds);
    setSelectedEntities(prev => ({ ...prev, [entity.id]: entity }));
    syncJsonFromHelpers({ ids: nextIds });
  }

  function removeEntityFromConfig(idToRemove: string) {
    const nextIds = selectedEntityIds.filter(id => id !== idToRemove);
    setSelectedEntityIds(nextIds);
    syncJsonFromHelpers({ ids: nextIds });
    if (fromEntityId === idToRemove) {
      setFromEntityId('');
      syncJsonFromHelpers({ ids: nextIds, from: '' });
    }
    if (toEntityId === idToRemove) {
      setToEntityId('');
      syncJsonFromHelpers({ ids: nextIds, to: '' });
    }
  }

  async function importStarredEntitiesIntoConfig() {
    if (selectedEntityIds.length >= 5 || loadingStarredEntities) return;
    setLoadingStarredEntities(true);
    try {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data: stars } = await sb
        .from('stars')
        .select('entity_id')
        .eq('user_id', user.id)
        .not('entity_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20);
      const starredIds = [...new Set((stars ?? []).map(s => s.entity_id).filter(Boolean) as string[])];
      const idsToFetch = starredIds.filter(id => !selectedEntityIds.includes(id)).slice(0, Math.max(0, 5 - selectedEntityIds.length));
      if (idsToFetch.length === 0) return;
      const { data: entitiesData } = await sb.from('entities').select('*').in('id', idsToFetch);
      const map: Record<string, Entity> = {};
      for (const entity of (entitiesData ?? []) as Entity[]) map[entity.id] = entity;
      const nextIds = [...selectedEntityIds, ...idsToFetch.filter(id => !!map[id])].slice(0, 5);
      setSelectedEntities(prev => ({ ...prev, ...map }));
      setSelectedEntityIds(nextIds);
      syncJsonFromHelpers({ ids: nextIds });
    } finally {
      setLoadingStarredEntities(false);
    }
  }

  async function copyShareLink() {
    const url = `${window.location.origin}/topics/${topic?.share_token}/embed`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (loading) return <div className="h-48 flex items-center justify-center" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>;
  if (!topic) return null;

  const currentTab = tabs[activeTab];
  const activeConfigPretty = currentTab ? JSON.stringify(currentTab.config ?? {}, null, 2) : '{}';

  useEffect(() => {
    if (!editingTab) return;
    clearTimeout(entitySearchTimer.current);
    entitySearchTimer.current = setTimeout(async () => {
      const query = configEntitySearch.trim();
      if (!query) {
        setConfigEntityOptions([]);
        return;
      }
      const sb = createClient();
      const { data } = await sb.from('entities').select('*').eq('is_public', true).ilike('name', `%${query}%`).limit(8);
      setConfigEntityOptions((data ?? []) as Entity[]);
    }, 250);
    return () => clearTimeout(entitySearchTimer.current);
  }, [configEntitySearch, editingTab]);

  useEffect(() => {
    if (!editingTab || selectedEntityIds.length === 0) return;
    const missingIds = selectedEntityIds.filter(id => !selectedEntities[id]);
    if (missingIds.length === 0) return;
    (async () => {
      const sb = createClient();
      const { data } = await sb.from('entities').select('*').in('id', missingIds);
      const map: Record<string, Entity> = {};
      for (const entity of (data ?? []) as Entity[]) map[entity.id] = entity;
      setSelectedEntities(prev => ({ ...prev, ...map }));
    })();
  }, [editingTab, selectedEntityIds, selectedEntities]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{topic.title}</h1>
          {topic.description && <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>{topic.description}</p>}
          {accountRestricted && (
            <p className="text-xs mt-2" style={{ color: 'var(--color-danger)' }}>
              Account restricted: topic editing is disabled.
            </p>
          )}
        </div>
        {isOwner && (
          <div className="flex items-center gap-2">
            <StarToggleButton kind="topic" targetId={topic.id} initialStarred={topicStarred} size="sm" label={false} />
            <button onClick={togglePublic} className="btn-ghost text-xs py-1.5 px-3">
              {topic.is_public ? <><Globe size={13} /> Public</> : <><Lock size={13} /> Private</>}
            </button>
            {topic.is_public && (
              <button onClick={copyShareLink} className="btn-ghost text-xs py-1.5 px-3">
                <Share2 size={13} /> {copied ? 'Copied!' : 'Share'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs bar */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1" style={{ borderBottom: '1px solid var(--color-bg-border)' }}>
        {tabs.map((tab, i) => {
          const Icon = TAB_ICONS[tab.view_type];
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(i)}
              draggable={isOwner}
              onDragStart={() => setDraggingTabId(tab.id)}
              onDragEnd={() => setDraggingTabId(null)}
              onDragOver={e => {
                if (!isOwner) return;
                e.preventDefault();
              }}
              onDrop={e => {
                if (!isOwner) return;
                e.preventDefault();
                if (draggingTabId) moveTab(draggingTabId, tab.id);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-sm whitespace-nowrap transition-colors flex-shrink-0"
              style={{
                color: activeTab === i ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                borderBottom: activeTab === i ? '2px solid var(--color-accent)' : '2px solid transparent',
                marginBottom: '-1px',
                opacity: draggingTabId === tab.id ? 0.6 : 1,
                cursor: isOwner ? 'grab' : 'pointer',
              }}
            >
              <Icon size={13} />
              {tab.title}
              {isOwner && (
                <span
                  onClick={e => { e.stopPropagation(); deleteTab(tab.id); }}
                  className="ml-1 opacity-0 hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--color-danger)' }}
                >×</span>
              )}
            </button>
          );
        })}

        {isOwner && !addingTab && (
          <button onClick={() => setAddingTab(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap" style={{ color: 'var(--color-accent)' }}>
            <Plus size={13} /> Add tab
          </button>
        )}

        {addingTab && (
          <div className="flex items-center gap-2 px-2">
            <input
              autoFocus
              value={newTabTitle}
              onChange={e => setNewTabTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTab()}
              placeholder="Tab title"
              className="input text-xs py-1 px-2"
              style={{ width: 120 }}
            />
            <select value={newTabType} onChange={e => setNewTabType(e.target.value as TabViewType)} className="input text-xs py-1 px-2" style={{ width: 100 }}>
              <option value="graph">Graph</option>
              <option value="timeline">Timeline</option>
              <option value="connections">Paths</option>
              <option value="list">List</option>
            </select>
            <button onClick={addTab} className="btn-primary text-xs py-1 px-3">Add</button>
            <button onClick={() => setAddingTab(false)} className="btn-ghost text-xs py-1">Cancel</button>
          </div>
        )}
      </div>
      {isOwner && (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Drag tabs to reorder.{savingOrder ? ' Saving order…' : ''}
        </p>
      )}

      {/* Tab content */}
      <div className="min-h-96">
        {!currentTab && (
          <div className="text-center py-20" style={{ color: 'var(--color-text-muted)' }}>
            {isOwner ? 'Add your first tab above' : 'No tabs in this topic yet.'}
          </div>
        )}
        {currentTab?.view_type === 'graph' && (
          <div className="-mx-4 sm:-mx-6" style={{ height: '70vh' }}>
            <GraphView
              initialEntityIds={
                Array.isArray(currentTab.config?.entity_ids) ? currentTab.config.entity_ids as string[] : []
              }
              onEntityIdsChange={isOwner ? async (ids) => {
                // Debounce-save entity_ids back to tab config
                const sb = createClient();
                await sb.from('topic_tabs')
                  .update({ config: { ...currentTab.config, entity_ids: ids } })
                  .eq('id', currentTab.id);
                setTabs(prev => prev.map(t =>
                  t.id === currentTab.id
                    ? { ...t, config: { ...t.config, entity_ids: ids } }
                    : t
                ));
              } : undefined}
            />
          </div>
        )}
        {currentTab?.view_type === 'timeline' && currentTab && <TimelineTab tab={currentTab} />}
        {currentTab?.view_type === 'connections' && currentTab && <ConnectionsTab tab={currentTab} />}
        {currentTab?.view_type === 'profile' && currentTab && <ProfileTab tab={currentTab} />}
        {currentTab?.view_type === 'list' && currentTab && <ListTab tab={currentTab} />}
      </div>

      {isOwner && currentTab && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Tab configuration</h3>
            {!editingTab ? (
              <button
                onClick={() => {
                  setEditingTab(true);
                  setEditTabTitle(currentTab.title);
                  setEditTabType(currentTab.view_type);
                  setEditTabConfig(activeConfigPretty);
                  const initialIds = getConfigEntityIds(currentTab);
                  const initialRels = getConfigRelationTypes(currentTab);
                  setSelectedEntityIds(initialIds);
                  setSelectedRelationTypes(initialRels);
                  setFromEntityId(typeof currentTab.config?.from_entity === 'string' ? currentTab.config.from_entity : '');
                  setToEntityId(typeof currentTab.config?.to_entity === 'string' ? currentTab.config.to_entity : '');
                  setConfigEntitySearch('');
                  setConfigEntityOptions([]);
                  setSaveTabError('');
                }}
                className="btn-ghost text-xs py-1 px-2"
              >
                <Pencil size={12} /> Edit
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={saveCurrentTabConfig} className="btn-primary text-xs py-1 px-2">Save</button>
                <button onClick={() => setEditingTab(false)} className="btn-ghost text-xs py-1 px-2">Cancel</button>
              </div>
            )}
          </div>

          {!editingTab ? (
            <pre className="text-xs p-3 rounded-lg overflow-x-auto" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-bg-border)', color: 'var(--color-text-secondary)' }}>
              {activeConfigPretty}
            </pre>
          ) : (
            <div className="space-y-2">
              <input className="input text-sm" value={editTabTitle} onChange={e => setEditTabTitle(e.target.value)} placeholder="Tab title" />
              <select className="input text-sm" value={editTabType} onChange={e => setEditTabType(e.target.value as TabViewType)}>
                <option value="graph">Graph</option>
                <option value="timeline">Timeline</option>
                <option value="profile">Profile</option>
                <option value="connections">Connections</option>
                <option value="list">List</option>
              </select>

              {(editTabType === 'timeline' || editTabType === 'profile' || editTabType === 'list' || editTabType === 'connections') && (
                <div className="space-y-2 rounded-lg p-3" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-bg-border)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>Entities (max 5)</p>
                    <button
                      type="button"
                      onClick={importStarredEntitiesIntoConfig}
                      disabled={loadingStarredEntities || selectedEntityIds.length >= 5}
                      className="btn-ghost text-xs py-1 px-2"
                    >
                      {loadingStarredEntities ? 'Loading…' : 'Use starred'}
                    </button>
                  </div>
                  <input
                    className="input text-sm"
                    value={configEntitySearch}
                    onChange={e => setConfigEntitySearch(e.target.value)}
                    placeholder="Search entities to add..."
                  />
                  {configEntityOptions.length > 0 && (
                    <div className="space-y-1 max-h-40 overflow-auto">
                      {configEntityOptions.map((entity) => (
                        <button
                          key={entity.id}
                          type="button"
                          onClick={() => addEntityToConfig(entity)}
                          className="w-full text-left px-2 py-1 rounded text-xs"
                          style={{ border: '1px solid var(--color-bg-border)', color: 'var(--color-text-secondary)' }}
                        >
                          {entity.name} <span style={{ color: 'var(--color-text-muted)' }}>({entity.type})</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedEntityIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedEntityIds.map((entityId) => {
                        const entity = selectedEntities[entityId];
                        return (
                          <span key={entityId} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-bg-border)' }}>
                            {entity?.name ?? entityId}
                            <button type="button" onClick={() => removeEntityFromConfig(entityId)} style={{ color: 'var(--color-danger)' }}>×</button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {editTabType === 'connections' && (
                <div className="grid sm:grid-cols-2 gap-2">
                  <select
                    className="input text-sm"
                    value={fromEntityId}
                    onChange={e => {
                      const next = e.target.value;
                      setFromEntityId(next);
                      syncJsonFromHelpers({ from: next });
                    }}
                  >
                    <option value="">From entity</option>
                    {selectedEntityIds.map((entityId) => (
                      <option key={entityId} value={entityId}>{selectedEntities[entityId]?.name ?? entityId}</option>
                    ))}
                  </select>
                  <select
                    className="input text-sm"
                    value={toEntityId}
                    onChange={e => {
                      const next = e.target.value;
                      setToEntityId(next);
                      syncJsonFromHelpers({ to: next });
                    }}
                  >
                    <option value="">To entity</option>
                    {selectedEntityIds.map((entityId) => (
                      <option key={entityId} value={entityId}>{selectedEntities[entityId]?.name ?? entityId}</option>
                    ))}
                  </select>
                </div>
              )}

              {editTabType === 'list' && (
                <div className="space-y-2 rounded-lg p-3" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-bg-border)' }}>
                  <p className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>Relation filters (optional)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(RELATION_META) as RelationType[]).map((relationType) => {
                      const active = selectedRelationTypes.includes(relationType);
                      return (
                        <button
                          key={relationType}
                          type="button"
                          onClick={() => toggleRelationType(relationType)}
                          className="text-xs px-2 py-1 rounded"
                          style={{
                            border: active ? '1px solid var(--color-accent)' : '1px solid var(--color-bg-border)',
                            color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                            background: active ? 'var(--color-accent-dim)' : 'transparent',
                          }}
                        >
                          {RELATION_META[relationType].label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <textarea
                className="input font-mono text-xs resize-y"
                style={{ minHeight: 140 }}
                value={editTabConfig}
                onChange={e => setEditTabConfig(e.target.value)}
                placeholder='{"entity_ids":[],"filter_types":[]}'
              />
              {saveTabError && <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{saveTabError}</p>}
            </div>
          )}
        </div>
      )}
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

async function loadShowNumerologyPref(sb: ReturnType<typeof createClient>): Promise<boolean> {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return true;
  const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single();
  if (profile && 'show_numerology' in profile && profile.show_numerology === false) return false;
  return true;
}

function TimelineTab({ tab }: { tab: TopicTab }) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [claimsByEntity, setClaimsByEntity] = useState<Record<string, ClaimWithEntity[]>>({});
  const [showNumerology, setShowNumerology] = useState(true);

  useEffect(() => {
    (async () => {
      const ids = getConfigEntityIds(tab);
      if (ids.length === 0) {
        setEntities([]);
        setClaimsByEntity({});
        return;
      }
      const sb = createClient();
      setShowNumerology(await loadShowNumerologyPref(sb));
      const { data: entityRows } = await sb.from('entities').select('*').in('id', ids);
      const ordered = ids.map(id => (entityRows ?? []).find(e => e.id === id)).filter(Boolean) as Entity[];
      setEntities(ordered);
      const visibilityPrefs = await loadVisibilityPrefs(sb);

      const results = await Promise.all(
        ids.map(async (id) => {
          const { data } = await sb.rpc('entity_claims', { entity_uuid: id, limit_n: 200 });
          const rawClaims = ((data ?? []) as ClaimWithEntity[]).filter(c => c.date_start);
          if (!visibilityPrefs || rawClaims.length === 0) return [id, rawClaims] as const;
          const claimIds = rawClaims.map(c => c.claim_id);
          const { data: claimMeta } = await sb.from('claims').select('id, created_by, source_domain').in('id', claimIds);
          const allowed = new Set(
            (claimMeta ?? [])
              .filter((meta) => {
                if (meta.source_domain && visibilityPrefs.blacklistedDomains.has(meta.source_domain) && !visibilityPrefs.whitelistedDomains.has(meta.source_domain)) return false;
                if (meta.created_by && visibilityPrefs.blacklistedUsers.has(meta.created_by) && !visibilityPrefs.whitelistedUsers.has(meta.created_by)) return false;
                return true;
              })
              .map(meta => meta.id),
          );
          return [id, rawClaims.filter(c => allowed.has(c.claim_id))] as const;
        }),
      );
      setClaimsByEntity(Object.fromEntries(results));
    })();
  }, [tab.id, JSON.stringify(tab.config)]);

  if (entities.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p style={{ color: 'var(--color-text-muted)' }}>Set `entity_ids` in tab config to render timeline view.</p>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <h3 className="section-title mb-4">Timeline</h3>
      <div className="grid gap-4">
        {entities.map((entity) => {
          const rows = (claimsByEntity[entity.id] ?? []).sort((a, b) => {
            const da = a.date_start ? new Date(a.date_start).getTime() : 0;
            const db = b.date_start ? new Date(b.date_start).getTime() : 0;
            return da - db;
          }).slice(0, 25);
          return (
            <div key={entity.id} className="rounded-lg p-3" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-bg-border)' }}>
              <Link href={`/entity/${entity.slug}`} className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>
                {entity.name}
              </Link>
              <div className="mt-2 space-y-2">
                {rows.length === 0 && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No dated claims.</p>}
                {rows.map((claim) => (
                  <div key={claim.claim_id} className="text-xs">
                    <span style={{ color: 'var(--color-text-muted)' }}>{formatDate(claim.date_start)}: </span>
                    <span style={{ color: 'var(--color-text-secondary)' }}>{claim.description}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {showNumerology && entities.length >= 2 && (
        <div className="mt-4 space-y-1.5">
          <p className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>Numeric coincidences</p>
          {(() => {
            const buckets = new Map<number, string[]>();
            for (const entity of entities) {
              for (const value of [...Object.values(gematria(entity.name)), ...numerologyValuesForEntity(entity)]) {
                const names = buckets.get(value) ?? [];
                if (!names.includes(entity.name)) names.push(entity.name);
                buckets.set(value, names);
              }
            }
            const rows = [...buckets.entries()].filter(([, names]) => names.length >= 2).slice(0, 6);
            if (rows.length === 0) return <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No shared numeric values.</p>;
            return rows.map(([value, names]) => (
              <div key={value} className="text-xs rounded px-2 py-1.5" style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)' }}>
                <span style={{ color: 'var(--color-text-primary)' }}>#{value}</span> · {names.join(' ↔ ')}
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
}

function ConnectionsTab({ tab }: { tab: TopicTab }) {
  const [loading, setLoading] = useState(false);
  const [path, setPath] = useState<{ hops: number; path: PathStep[] } | null>(null);
  const [entities, setEntities] = useState<Record<string, Entity>>({});
  const [claims, setClaims] = useState<Record<string, { relation_type: keyof typeof RELATION_META; description: string }>>({});
  const [error, setError] = useState('');
  const [showNumerology, setShowNumerology] = useState(true);

  useEffect(() => {
    (async () => {
      const from = typeof tab.config?.from_entity === 'string' ? tab.config.from_entity : '';
      const to = typeof tab.config?.to_entity === 'string' ? tab.config.to_entity : '';
      if (!from || !to) {
        setPath(null);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/paths/compute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from_entity: from, to_entity: to, max_hops: 4 }),
        });
        const json = await res.json();
        if (!json.path) {
          setPath(null);
          setError('No path found within 4 hops.');
          return;
        }
        setPath(json.path);

        const sb = createClient();
        setShowNumerology(await loadShowNumerologyPref(sb));
        const entityIds = [...new Set((json.path.path as PathStep[]).map((s: PathStep) => s.entity_id))];
        const claimIds = [...new Set((json.path.path as PathStep[]).map((s: PathStep) => s.claim_id).filter(Boolean))];
        const [{ data: entityRows }, { data: claimRows }] = await Promise.all([
          sb.from('entities').select('*').in('id', entityIds),
          sb.from('claims').select('id, relation_type, description').in('id', claimIds),
        ]);
        setEntities(Object.fromEntries((entityRows ?? []).map(e => [e.id, e as Entity])));
        setClaims(Object.fromEntries((claimRows ?? []).map(c => [c.id, c as { relation_type: keyof typeof RELATION_META; description: string }])));
      } catch (err: any) {
        setError(err?.message ?? 'Path lookup failed');
      } finally {
        setLoading(false);
      }
    })();
  }, [tab.id, JSON.stringify(tab.config)]);

  if (loading) return <div className="card p-10 text-center" style={{ color: 'var(--color-text-muted)' }}>Computing path…</div>;
  if (!path) {
    return (
      <div className="card p-10 text-center">
        <p style={{ color: 'var(--color-text-muted)' }}>
          {error || 'Set `from_entity` and `to_entity` in tab config to render connections view.'}
        </p>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <h3 className="section-title mb-4">Connection path ({path.hops} hops)</h3>
      <div className="space-y-3">
        {path.path.map((step, index) => {
          const entity = entities[step.entity_id];
          const claim = claims[step.claim_id];
          if (!entity) return null;
          return (
            <div key={`${step.entity_id}-${index}`} className="text-sm">
              <Link href={`/entity/${entity.slug}`} style={{ color: 'var(--color-accent)' }}>{entity.name}</Link>
              {claim && (
                <span style={{ color: 'var(--color-text-muted)' }}>
                  {' '}→ {RELATION_META[claim.relation_type]?.label ?? claim.relation_type}: {claim.description}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {showNumerology && Object.keys(entities).length >= 2 && (
        <div className="mt-4 space-y-1.5">
          <p className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>Numeric coincidences</p>
          {(() => {
            const values = Object.values(entities);
            const buckets = new Map<number, string[]>();
            for (const entity of values) {
              for (const value of Object.values(gematria(entity.name))) {
                const names = buckets.get(value) ?? [];
                if (!names.includes(entity.name)) names.push(entity.name);
                buckets.set(value, names);
              }
            }
            const rows = [...buckets.entries()].filter(([, names]) => names.length >= 2).slice(0, 6);
            if (rows.length === 0) return <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No shared numeric values.</p>;
            return rows.map(([value, names]) => (
              <div key={value} className="text-xs rounded px-2 py-1.5" style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)' }}>
                <span style={{ color: 'var(--color-text-primary)' }}>#{value}</span> · {names.join(' ↔ ')}
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
}

function ProfileTab({ tab }: { tab: TopicTab }) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [showNumerology, setShowNumerology] = useState(true);

  useEffect(() => {
    (async () => {
      const ids = getConfigEntityIds(tab);
      if (ids.length === 0) {
        setEntities([]);
        return;
      }
      const sb = createClient();
      setShowNumerology(await loadShowNumerologyPref(sb));
      const { data } = await sb.from('entities').select('*').in('id', ids);
      const ordered = ids.map(id => (data ?? []).find(e => e.id === id)).filter(Boolean) as Entity[];
      setEntities(ordered);
    })();
  }, [tab.id, JSON.stringify(tab.config)]);

  if (entities.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p style={{ color: 'var(--color-text-muted)' }}>Set `entity_ids` in tab config to render profile view.</p>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <h3 className="section-title mb-4">Profiles</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {entities.map((entity) => (
          <Link key={entity.id} href={`/entity/${entity.slug}`} className="rounded-lg p-3 hover:-translate-y-0.5 transition-transform" style={{ border: '1px solid var(--color-bg-border)', background: 'var(--color-bg-surface)' }}>
            <p className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>{entity.name}</p>
            <p className="text-xs capitalize mt-1" style={{ color: 'var(--color-text-muted)' }}>{entity.type}</p>
            {entity.description && <p className="text-xs mt-2 line-clamp-2" style={{ color: 'var(--color-text-secondary)' }}>{entity.description}</p>}
            {showNumerology && (
              <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
                O:{gematria(entity.name).ordinal} · FR:{gematria(entity.name).full_reduction}
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

function ListTab({ tab }: { tab: TopicTab }) {
  const [rows, setRows] = useState<ClaimWithEntity[]>([]);

  useEffect(() => {
    (async () => {
      const ids = getConfigEntityIds(tab);
      if (ids.length === 0) {
        setRows([]);
        return;
      }
      const sb = createClient();
      const relationFilter = new Set(getConfigRelationTypes(tab));
      const visibilityPrefs = await loadVisibilityPrefs(sb);
      const bundles = await Promise.all(ids.map(async (id) => {
        const { data } = await sb.rpc('entity_claims', { entity_uuid: id, limit_n: 80 });
        return (data ?? []) as ClaimWithEntity[];
      }));
      const flattened = bundles.flat();
      let filtered = flattened;
      if (visibilityPrefs && flattened.length > 0) {
        const claimIds = flattened.map(c => c.claim_id);
        const { data: claimMeta } = await sb.from('claims').select('id, created_by, source_domain').in('id', claimIds);
        const allowed = new Set(
          (claimMeta ?? [])
            .filter((meta) => {
              if (meta.source_domain && visibilityPrefs.blacklistedDomains.has(meta.source_domain) && !visibilityPrefs.whitelistedDomains.has(meta.source_domain)) return false;
              if (meta.created_by && visibilityPrefs.blacklistedUsers.has(meta.created_by) && !visibilityPrefs.whitelistedUsers.has(meta.created_by)) return false;
              return true;
            })
            .map(meta => meta.id),
        );
        filtered = flattened.filter(c => allowed.has(c.claim_id));
      }
      const dedup = new Map<string, ClaimWithEntity>();
      for (const claim of filtered) {
        if (relationFilter.size > 0 && !relationFilter.has(claim.relation_type)) continue;
        dedup.set(claim.claim_id, claim);
      }
      setRows([...dedup.values()].slice(0, 120));
    })();
  }, [tab.id, JSON.stringify(tab.config)]);

  if (rows.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p style={{ color: 'var(--color-text-muted)' }}>No list rows. Add `entity_ids` (and optional `filter_types`) in config.</p>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <h3 className="section-title mb-4">Connections list</h3>
      <div className="space-y-2">
        {rows.map((claim) => (
          <div key={claim.claim_id} className="rounded-lg p-3" style={{ border: '1px solid var(--color-bg-border)', background: 'var(--color-bg-surface)' }}>
            <p className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
              {RELATION_META[claim.relation_type]?.icon} {RELATION_META[claim.relation_type]?.label}
            </p>
            <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>{claim.description}</p>
            <div className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              <Link href={`/entity/${claim.other_entity_slug}`} style={{ color: 'var(--color-accent)' }}>{claim.other_entity_name}</Link>
              {claim.date_start ? ` · ${formatDate(claim.date_start)}` : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
