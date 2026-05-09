'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Globe, Lock, Share2, Pencil, Trash2, BarChart2, Network, Clock, List, GitBranch } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { GraphView } from '@/components/graph/GraphView';
import type { Topic, TopicTab, TabViewType } from '@/types';

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
  const [loading, setLoading] = useState(true);
  const [addingTab, setAddingTab] = useState(false);
  const [newTabTitle, setNewTabTitle] = useState('');
  const [newTabType, setNewTabType] = useState<TabViewType>('graph');
  const [copied, setCopied] = useState(false);

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
      setIsOwner(user?.id === topicData.user_id);

      // Increment view count
      if (user?.id !== topicData.user_id) {
        await sb.from('topics').update({ views: (topicData.views ?? 0) + 1 }).eq('id', id);
      }

      setLoading(false);
    })();
  }, [id]);

  async function addTab() {
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
    if (!topic) return;
    const sb = createClient();
    const { data } = await sb.from('topics').update({ is_public: !topic.is_public }).eq('id', id).select().single();
    if (data) setTopic(data as Topic);
  }

  async function deleteTab(tabId: string) {
    const sb = createClient();
    await sb.from('topic_tabs').delete().eq('id', tabId);
    setTabs(prev => prev.filter(t => t.id !== tabId));
    setActiveTab(0);
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{topic.title}</h1>
          {topic.description && <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>{topic.description}</p>}
        </div>
        {isOwner && (
          <div className="flex items-center gap-2">
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
              className="flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-sm whitespace-nowrap transition-colors flex-shrink-0"
              style={{
                color: activeTab === i ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                borderBottom: activeTab === i ? '2px solid var(--color-accent)' : '2px solid transparent',
                marginBottom: '-1px',
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

      {/* Tab content */}
      <div className="min-h-96">
        {!currentTab && (
          <div className="text-center py-20" style={{ color: 'var(--color-text-muted)' }}>
            {isOwner ? 'Add your first tab above' : 'No tabs in this topic yet.'}
          </div>
        )}
        {currentTab?.view_type === 'graph' && (
          <div className="-mx-4 sm:-mx-6" style={{ height: '70vh' }}>
            <GraphView />
          </div>
        )}
        {currentTab?.view_type !== 'graph' && currentTab && (
          <div className="card p-12 text-center">
            <p style={{ color: 'var(--color-text-muted)' }}>{currentTab.view_type} view — coming soon for this tab</p>
          </div>
        )}
      </div>
    </div>
  );
}
