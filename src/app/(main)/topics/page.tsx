import Link from 'next/link';
import { Plus, Globe, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import type { Topic } from '@/types';

export const metadata = { title: 'Topics' };

export default async function TopicsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Public topics
  const { data: publicTopics } = await supabase
    .from('topics')
    .select('*, profiles(display_name, at_name)')
    .eq('is_public', true)
    .order('views', { ascending: false })
    .limit(30);

  // User's private topics
  let myTopics: Topic[] = [];
  if (user) {
    const { data } = await supabase.from('topics').select('*').eq('user_id', user.id).order('updated_at', { ascending: false });
    myTopics = (data ?? []) as Topic[];
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Topics</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>Curated collections of connections you can share.</p>
        </div>
        {user && (
          <Link href="/topics/new" className="btn-primary">
            <Plus size={16} /> New topic
          </Link>
        )}
      </div>

      {/* My topics */}
      {myTopics.length > 0 && (
        <section>
          <h2 className="section-title mb-4">My topics</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {myTopics.map(topic => (
              <TopicCard key={topic.id} topic={topic} mine />
            ))}
          </div>
        </section>
      )}

      {/* Public topics */}
      <section>
        <h2 className="section-title mb-4">Public topics</h2>
        {(publicTopics ?? []).length === 0 ? (
          <div className="card p-12 text-center">
            <p style={{ color: 'var(--color-text-muted)' }}>No public topics yet. Be the first!</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(publicTopics ?? []).map((topic: any) => (
              <TopicCard key={topic.id} topic={topic} authorName={topic.profiles?.display_name} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TopicCard({ topic, mine, authorName }: { topic: Topic; mine?: boolean; authorName?: string }) {
  return (
    <Link
      href={`/topics/${topic.id}`}
      className="card p-5 group hover:border-[rgba(99,102,241,0.3)] transition-all duration-200"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-sm group-hover:text-[var(--color-accent)] transition-colors" style={{ color: 'var(--color-text-primary)' }}>
          {topic.title}
        </h3>
        {topic.is_public
          ? <Globe size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          : <Lock size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
        }
      </div>

      {topic.description && (
        <p className="text-xs leading-relaxed line-clamp-2 mb-3" style={{ color: 'var(--color-text-secondary)' }}>
          {topic.description}
        </p>
      )}

      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {authorName ? <span>by {authorName}</span> : <span>{mine ? 'private' : ''}</span>}
        <span>{topic.views} views</span>
      </div>
    </Link>
  );
}
