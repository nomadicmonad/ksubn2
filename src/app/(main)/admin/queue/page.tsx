import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { CheckCircle, Clock, AlertCircle, Loader } from 'lucide-react';

export const metadata = { title: 'Queue status' };
export const revalidate = 0;

const STATUS_ICON: Record<string, React.ComponentType<{ size: number; style?: React.CSSProperties }>> = {
  pending:    Clock,
  processing: Loader,
  done:       CheckCircle,
  failed:     AlertCircle,
};

const STATUS_COLOR: Record<string, string> = {
  pending:    'var(--color-warning)',
  processing: 'var(--color-accent)',
  done:       'var(--color-success)',
  failed:     'var(--color-danger)',
};

export default async function QueuePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin/queue');

  const { data: items } = await supabase
    .from('entity_queue')
    .select('*, entities(name, slug, image_url)')
    .order('created_at', { ascending: false })
    .limit(100);

  const counts = (items ?? []).reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Image queue</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Status of entity image generation jobs. Runs daily at 06:00 UTC.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {['pending', 'processing', 'done', 'failed'].map(status => {
          const Icon = STATUS_ICON[status];
          return (
            <div key={status} className="card p-4 flex items-center gap-3">
              <Icon size={18} style={{ color: STATUS_COLOR[status], flexShrink: 0 }} />
              <div>
                <div className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                  {counts[status] ?? 0}
                </div>
                <div className="text-xs capitalize" style={{ color: 'var(--color-text-muted)' }}>{status}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Trigger */}
      <div className="card p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>Manual trigger</p>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Call /api/cron/daily with your CRON_SECRET to process the next batch.
          </p>
        </div>
        <code className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'var(--color-bg-hover)', color: 'var(--color-accent)' }}>
          POST /api/cron/daily
        </code>
      </div>

      {/* Items list */}
      <div className="space-y-2">
        {(items ?? []).map((item: any) => {
          const Icon = STATUS_ICON[item.status] ?? Clock;
          const color = STATUS_COLOR[item.status] ?? 'var(--color-text-muted)';
          const entity = item.entities as { name: string; slug: string; image_url: string | null } | null;

          return (
            <div key={item.id} className="card p-3 flex items-center gap-3">
              <Icon size={14} style={{ color, flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {entity ? (
                    <Link href={`/entity/${entity.slug}`}
                      className="text-sm font-medium hover:underline"
                      style={{ color: 'var(--color-text-primary)' }}>
                      {entity.name}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{item.name}</span>
                  )}
                  <span className="text-xs capitalize" style={{ color, background: `${color}15`, padding: '1px 6px', borderRadius: '999px' }}>
                    {item.status}
                  </span>
                  {entity?.image_url && (
                    <span className="text-xs" style={{ color: 'var(--color-success)' }}>✓ has image</span>
                  )}
                </div>
                {item.error && (
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-danger)' }}>
                    {item.last_error_code}: {item.error}
                  </p>
                )}
                <div className="flex gap-3 text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  <span>{item.entity_type}</span>
                  {item.attempts > 0 && <span>attempts: {item.attempts}</span>}
                  <span>{new Date(item.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
