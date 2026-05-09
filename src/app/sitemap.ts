import type { MetadataRoute } from 'next';
import { createClient } from '@/lib/supabase/server';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ksubn.com';
  const supabase = await createClient();

  const { data: entities } = await supabase
    .from('entities')
    .select('slug, updated_at')
    .eq('is_public', true)
    .order('direct_claim_count', { ascending: false })
    .limit(1000);

  const { data: topics } = await supabase
    .from('topics')
    .select('id, updated_at')
    .eq('is_public', true)
    .order('views', { ascending: false })
    .limit(200);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${base}/search`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}/graph`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/paths`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/timeline`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/topics`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/recent`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.7 },
  ];

  const entityRoutes: MetadataRoute.Sitemap = (entities ?? []).map(e => ({
    url: `${base}/entity/${e.slug}`,
    lastModified: new Date(e.updated_at),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  const topicRoutes: MetadataRoute.Sitemap = (topics ?? []).map(t => ({
    url: `${base}/topics/${t.id}`,
    lastModified: new Date(t.updated_at),
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...entityRoutes, ...topicRoutes];
}
