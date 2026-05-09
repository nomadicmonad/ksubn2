/**
 * POST /api/queue/process
 * Called by a Vercel cron job (or manually) to process entity_queue rows.
 * Each pending entity gets:
 *   1. Wikipedia/Wikidata profile data fetched
 *   2. LLM-generated summary via Claude
 *   3. AI silhouette image via Replicate FLUX
 *   4. Written back to entities table
 *
 * Secured via CRON_SECRET header.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

interface WikidataEntity {
  labels?: { en?: { value: string } };
  descriptions?: { en?: { value: string } };
  sitelinks?: { enwiki?: { url: string } };
  claims?: Record<string, any[]>;
}

async function fetchWikidata(qid: string): Promise<WikidataEntity | null> {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return null;
  const data = await res.json();
  return data.entities?.[qid] ?? null;
}

async function fetchWikipediaSummary(title: string): Promise<string | null> {
  const encoded = encodeURIComponent(title.replace(/ /g, '_'));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return null;
  const data = await res.json();
  return data.extract ?? null;
}

async function generateSilhouette(name: string, entityType: string): Promise<string | null> {
  const apiToken = process.env.REPLICATE_API_TOKEN;
  if (!apiToken) return null;

  const prompt = entityType === 'person'
    ? `Dramatic dark silhouette portrait of a person named ${name}, stark black background, noir style, high contrast, professional headshot silhouette, cinematic lighting, deep shadow`
    : entityType === 'organization'
    ? `Abstract dark logo silhouette representing an organization called ${name}, minimalist icon, black background, geometric shapes, corporate symbol`
    : `Abstract dark silhouette representing the event "${name}", dramatic scene, black background, symbolic imagery, cinematic`;

  const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
    method: 'POST',
    headers: { 'Authorization': `Token ${apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { prompt, aspect_ratio: '1:1', output_format: 'webp', output_quality: 80, num_inference_steps: 4 },
    }),
  });

  if (!res.ok) return null;
  const prediction = await res.json();

  // Poll for completion (max 30s)
  const pollUrl = prediction.urls?.get;
  if (!pollUrl) return null;

  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const poll = await fetch(pollUrl, { headers: { 'Authorization': `Token ${apiToken}` } });
    const result = await poll.json();
    if (result.status === 'succeeded' && result.output?.[0]) {
      return result.output[0] as string;
    }
    if (result.status === 'failed') return null;
  }
  return null;
}

async function uploadImageToStorage(imageUrl: string, entityId: string): Promise<string | null> {
  const res = await fetch(imageUrl);
  if (!res.ok) return null;
  const blob = await res.blob();
  const buffer = Buffer.from(await blob.arrayBuffer());

  const { data, error } = await sb.storage
    .from('entity-images')
    .upload(`${entityId}.webp`, buffer, { contentType: 'image/webp', upsert: true });

  if (error) return null;
  const { data: urlData } = sb.storage.from('entity-images').getPublicUrl(data.path);
  return urlData.publicUrl;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

export async function POST(request: Request) {
  // Auth check
  const secret = request.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Pick up to 3 pending items
  const { data: items } = await sb
    .from('entity_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at')
    .limit(3);

  if (!items?.length) return NextResponse.json({ processed: 0 });

  const results = [];

  for (const item of items) {
    // Mark as processing
    await sb.from('entity_queue').update({ status: 'processing' }).eq('id', item.id);

    try {
      let name = item.name;
      let description = '';
      let summary = '';
      let wikipediaUrl = item.wikipedia_url ?? null;
      let wikidataId = item.wikidata_id ?? null;
      let country = null;
      let birthDate = null;
      let deathDate = null;

      // Fetch Wikidata if we have a Q-id
      if (wikidataId) {
        const wd = await fetchWikidata(wikidataId);
        if (wd) {
          name = wd.labels?.en?.value ?? name;
          description = wd.descriptions?.en?.value ?? '';

          // Wikipedia URL from sitelinks
          if (!wikipediaUrl && wd.sitelinks?.enwiki) {
            wikipediaUrl = wd.sitelinks.enwiki.url;
          }

          // Extract dates from Wikidata claims (P569 = birth, P570 = death, P571 = inception)
          const birthClaim = wd.claims?.P569?.[0]?.mainsnak?.datavalue?.value?.time;
          const deathClaim = wd.claims?.P570?.[0]?.mainsnak?.datavalue?.value?.time;
          if (birthClaim) birthDate = birthClaim.replace('+', '').slice(0, 10);
          if (deathClaim) deathDate = deathClaim.replace('+', '').slice(0, 10);

          // Country (P17 = country, P27 = country of citizenship)
          const countryClaim = wd.claims?.P27?.[0] ?? wd.claims?.P17?.[0];
          if (countryClaim) {
            // We'd need another lookup to get the ISO code — skip for now
          }
        }
      }

      // Fetch Wikipedia summary for longer description
      if (wikipediaUrl) {
        const wpTitle = decodeURIComponent(wikipediaUrl.split('/wiki/').pop() ?? '');
        const wpSummary = await fetchWikipediaSummary(wpTitle);
        if (wpSummary) {
          summary = wpSummary.slice(0, 600);
          if (!description) description = wpSummary.slice(0, 150);
        }
      }

      // Create the entity record (or find existing)
      const slug = slugify(name) + (wikidataId ? `-${wikidataId.toLowerCase()}` : '');
      const { data: existingEntity } = await sb.from('entities').select('id').eq('slug', slug).single();

      let entityId = existingEntity?.id;

      if (!entityId) {
        const { data: newEntity, error: insertErr } = await sb.from('entities').insert({
          slug,
          type: item.entity_type ?? 'person',
          name,
          description: description.slice(0, 300) || null,
          summary: summary || null,
          wikidata_id: wikidataId,
          wikipedia_url: wikipediaUrl,
          birth_date: birthDate,
          death_date: deathDate,
          country,
          tags: [],
          aliases: [],
          is_public: true,
          is_bulkbot: !item.submitted_by,
          created_by: item.submitted_by,
        }).select('id').single();

        if (insertErr) throw new Error(insertErr.message);
        entityId = newEntity!.id;
      }

      // Generate and upload silhouette image
      const replicateUrl = await generateSilhouette(name, item.entity_type ?? 'person');
      if (replicateUrl && entityId) {
        const storedUrl = await uploadImageToStorage(replicateUrl, entityId);
        if (storedUrl) {
          await sb.from('entities').update({ image_url: storedUrl }).eq('id', entityId);
        }
      }

      // Mark queue item done
      await sb.from('entity_queue').update({
        status: 'done',
        processed_at: new Date().toISOString(),
        result_entity: entityId,
      }).eq('id', item.id);

      results.push({ id: item.id, name, entityId, ok: true });

    } catch (err: any) {
      await sb.from('entity_queue').update({
        status: 'failed',
        error: err.message,
        processed_at: new Date().toISOString(),
      }).eq('id', item.id);
      results.push({ id: item.id, name: item.name, ok: false, error: err.message });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}

// Also handle GET for manual trigger from browser
export async function GET(request: Request) {
  return POST(request);
}
