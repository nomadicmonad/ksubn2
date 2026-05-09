'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Network, Clock, GitBranch, List, BarChart2, ExternalLink } from 'lucide-react';
import type { Topic, TopicTab, TabViewType } from '@/types';
import { GraphView } from '@/components/graph/GraphView';

const TAB_ICONS: Record<TabViewType, React.ComponentType<{ size: number }>> = {
  graph:       Network,
  timeline:    Clock,
  profile:     BarChart2,
  connections: GitBranch,
  list:        List,
};

interface Props { topic: Topic; tabs: TopicTab[] }

export function EmbedClient({ topic, tabs }: Props) {
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
        {currentTab?.view_type === 'graph' && <GraphView />}
        {currentTab && currentTab.view_type !== 'graph' && (
          <div className="h-full flex items-center justify-center" style={{ color: 'var(--color-text-muted)' }}>
            <div className="text-center">
              <p className="text-sm">{currentTab.view_type} view</p>
              <Link href={`/topics/${topic.id}`} className="text-xs mt-2 hover:underline" style={{ color: 'var(--color-accent)' }}>
                Open full version →
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
