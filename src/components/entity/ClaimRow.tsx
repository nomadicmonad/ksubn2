'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ThumbsUp, ThumbsDown, Flag, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import type { ClaimWithEntity, RelationType } from '@/types';
import { RELATION_META } from '@/types';
import { EntityPill } from './EntityCard';
import { createClient } from '@/lib/supabase/client';
import { formatDate as fmtDate } from '@/lib/utils';

const RM = RELATION_META;

interface ClaimRowProps {
  claim: ClaimWithEntity;
  currentEntityId?: string;
  userVote?: -1 | 0 | 1;
  hasReported?: boolean;
}

export function ClaimRow({ claim, currentEntityId, userVote = 0, hasReported = false }: ClaimRowProps) {
  const [vote, setVote] = useState<-1 | 0 | 1>(userVote);
  const [upvotes, setUpvotes] = useState(claim.upvotes);
  const [downvotes, setDownvotes] = useState(claim.downvotes);
  const [reported, setReported] = useState(hasReported);
  const [expanded, setExpanded] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState('');

  const meta = RM[claim.relation_type];

  async function handleVote(v: 1 | -1) {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.location.href = '/login'; return; }

    const newVote = vote === v ? 0 : v;
    // Optimistic update
    if (vote === 1) setUpvotes(u => u - 1);
    if (vote === -1) setDownvotes(d => d - 1);
    if (newVote === 1) setUpvotes(u => u + 1);
    if (newVote === -1) setDownvotes(d => d + 1);
    setVote(newVote);

    if (newVote === 0) {
      await sb.from('claim_votes').delete().match({ claim_id: claim.claim_id, user_id: user.id });
    } else {
      await sb.from('claim_votes').upsert({ claim_id: claim.claim_id, user_id: user.id, vote: newVote });
    }
  }

  async function submitReport() {
    if (!reportReason.trim()) return;
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.location.href = '/login'; return; }
    await sb.from('claim_reports').upsert({ claim_id: claim.claim_id, user_id: user.id, reason: reportReason.trim() });
    setReported(true);
    setReporting(false);
  }

  const otherEntity = {
    name: claim.other_entity_name,
    slug: claim.other_entity_slug,
    type: claim.other_entity_type,
    image_url: claim.other_entity_image,
  };

  return (
    <div
      className="rounded-xl p-4 transition-all"
      style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-bg-border)' }}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        {/* Relation badge */}
        <span
          className={`badge rel-${claim.relation_type} flex-shrink-0 mt-0.5`}
        >
          {meta.icon} {meta.label}
        </span>

        <div className="flex-1 min-w-0">
          {/* Entity pill */}
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            <EntityPill entity={otherEntity} />
            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
              {claim.direction === 'outgoing' ? '→' : '←'}
            </span>
          </div>

          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
            {claim.description}
          </p>

          {/* Dates */}
          {(claim.date_start || claim.date_end) && (
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              {fmtDate(claim.date_start)} {claim.date_end ? `– ${fmtDate(claim.date_end)}` : ''}
            </p>
          )}
        </div>
      </div>

      {/* Footer: source + voting */}
      <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid var(--color-bg-border)' }}>
        {/* Source link */}
        <a
          href={claim.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs hover:underline"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <ExternalLink size={11} />
          {claim.source_domain ?? 'source'}
        </a>

        {/* Voting + report */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleVote(1)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors"
            style={{
              background: vote === 1 ? 'var(--color-success)20' : 'transparent',
              color: vote === 1 ? 'var(--color-success)' : 'var(--color-text-muted)',
            }}
          >
            <ThumbsUp size={12} /> {upvotes > 0 ? upvotes : ''}
          </button>

          <button
            onClick={() => handleVote(-1)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors"
            style={{
              background: vote === -1 ? 'var(--color-danger)20' : 'transparent',
              color: vote === -1 ? 'var(--color-danger)' : 'var(--color-text-muted)',
            }}
          >
            <ThumbsDown size={12} /> {downvotes > 0 ? downvotes : ''}
          </button>

          <button
            onClick={() => { if (!reported) setReporting(r => !r); }}
            className="p-1.5 rounded-lg text-xs transition-colors"
            title={reported ? 'Already reported' : 'Report this claim'}
            style={{ color: reported ? 'var(--color-danger)' : 'var(--color-text-muted)' }}
          >
            <Flag size={12} />
          </button>
        </div>
      </div>

      {/* Report form */}
      {reporting && (
        <div className="mt-3 space-y-2 animate-fade-in">
          <textarea
            value={reportReason}
            onChange={e => setReportReason(e.target.value)}
            placeholder="Why are you reporting this? (bad faith, illegal content, spam…)"
            className="w-full text-xs rounded-lg p-2 resize-none"
            style={{
              background: 'var(--color-bg-surface)',
              border: '1px solid var(--color-bg-border)',
              color: 'var(--color-text-primary)',
              minHeight: '60px',
            }}
          />
          <div className="flex gap-2">
            <button onClick={submitReport} className="btn-primary text-xs py-1 px-3">Submit report</button>
            <button onClick={() => setReporting(false)} className="btn-ghost text-xs py-1 px-3">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
