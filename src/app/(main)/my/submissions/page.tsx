import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Trash2, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { RELATION_META } from '@/types';
import type { RelationType } from '@/types';

export const metadata = { title: 'My Submissions' };

async function DeleteButton({ claimId }: { claimId: string }) {
  return (
    <form action={async () => {
      'use server';
      const sb = await createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      await sb.from('claims').delete().eq('id', claimId).eq('created_by', user.id);
    }}>
      <button type="submit" className="p-2 rounded-lg hover:bg-red-500/10 transition-colors" style={{ color: 'var(--color-danger)' }} title="Delete">
        <Trash2 size={14} />
      </button>
    </form>
  );
}

export default async function MySubmissionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/my/submissions');

  const { data: claims } = await supabase
    .from('claims')
    .select(`
      id, relation_type, description, source_url, source_domain,
      created_at, upvotes, downvotes, is_hidden,
      from_entity:entities!claims_from_entity_fkey(id, name, slug, type),
      to_entity:entities!claims_to_entity_fkey(id, name, slug, type)
    `)
    .eq('created_by', user.id)
    .order('created_at', { ascending: false });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>My Submissions</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Claims you have submitted. You can delete any of them.
        </p>
      </div>

      {(!claims || claims.length === 0) ? (
        <div className="card p-12 text-center">
          <p style={{ color: 'var(--color-text-muted)' }}>You haven't submitted any claims yet.</p>
          <Link href="/submit" className="btn-primary mt-4 inline-flex">Submit your first connection</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {claims.map((claim: any) => {
            const meta = RELATION_META[claim.relation_type as RelationType];
            return (
              <div key={claim.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Link href={`/entity/${claim.from_entity.slug}`} className="text-sm font-medium hover:underline" style={{ color: 'var(--color-accent)' }}>
                        {claim.from_entity.name}
                      </Link>
                      <span className={`badge rel-${claim.relation_type}`}>{meta.icon} {meta.label}</span>
                      <Link href={`/entity/${claim.to_entity.slug}`} className="text-sm font-medium hover:underline" style={{ color: 'var(--color-accent)' }}>
                        {claim.to_entity.name}
                      </Link>
                    </div>

                    <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{claim.description}</p>

                    <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      <a href={claim.source_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">
                        <ExternalLink size={10} /> {claim.source_domain ?? 'source'}
                      </a>
                      <span>👍 {claim.upvotes} · 👎 {claim.downvotes}</span>
                      {claim.is_hidden && <span style={{ color: 'var(--color-danger)' }}>Hidden by moderators</span>}
                      <span>{new Date(claim.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <DeleteButton claimId={claim.id} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
