import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Topic, TopicTab } from '@/types';
import { EmbedClient } from './EmbedClient';

interface Props { params: Promise<{ id: string }> }

export default async function EmbedPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  // id could be the uuid or the share_token
  const { data: topic } = await supabase
    .from('topics')
    .select('*')
    .or(`id.eq.${id},share_token.eq.${id}`)
    .eq('is_public', true)
    .single();

  if (!topic) notFound();

  // Increment views
  await supabase.from('topics').update({ views: (topic.views ?? 0) + 1 }).eq('id', topic.id);

  const { data: tabs } = await supabase
    .from('topic_tabs')
    .select('*')
    .eq('topic_id', topic.id)
    .order('position');

  return <EmbedClient topic={topic as Topic} tabs={(tabs ?? []) as TopicTab[]} />;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from('topics').select('title, description').or(`id.eq.${id},share_token.eq.${id}`).single();
  return { title: data?.title ?? 'ksubn topic', description: data?.description ?? '' };
}
