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

const MAX_ATTEMPTS = 4;
const RETRY_MINUTES = [5, 30, 180];

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || url.includes('your_supabase_project_url') || key.includes('your_service_role_key')) {
    throw new Error('Supabase admin env vars are not configured.');
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

interface WikidataEntity {
  labels?: { en?: { value: string } };
  descriptions?: { en?: { value: string } };
  sitelinks?: { enwiki?: { url: string } };
  claims?: Record<string, any[]>;
}

function errorCodeFromMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('timeout')) return 'timeout';
  if (lower.includes('replicate')) return 'image_generation_failed';
  if (lower.includes('wikidata')) return 'wikidata_fetch_failed';
  if (lower.includes('wikipedia')) return 'wikipedia_fetch_failed';
  if (lower.includes('storage')) return 'storage_upload_failed';
  if (lower.includes('insert') || lower.includes('update')) return 'db_write_failed';
  return 'unknown_error';
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseWikidataDate(raw: string | undefined): string | null {
  if (!raw) return null;
  // Wikidata: +1953-01-20T00:00:00Z
  const match = raw.match(/([+-]?\d{4,})-(\d{2})-(\d{2})T/);
  if (!match) return null;
  const year = match[1].replace('+', '').slice(-4);
  return `${year}-${match[2]}-${match[3]}`;
}

function nextRetryAtIso(attempts: number): string | null {
  const idx = Math.max(0, attempts - 1);
  const minutes = RETRY_MINUTES[Math.min(idx, RETRY_MINUTES.length - 1)];
  if (!minutes) return null;
  const at = new Date(Date.now() + minutes * 60_000);
  return at.toISOString();
}

async function fetchWikidata(qid: string): Promise<WikidataEntity | null> {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
  const res = await fetchWithTimeout(url, { next: { revalidate: 0 } }, 12000);
  if (!res.ok) return null;
  const data = await res.json();
  return data.entities?.[qid] ?? null;
}

interface WikipediaSummary {
  extract: string | null;
  thumbnail?: { source: string; width: number; height: number };
  originalimage?: { source: string };
}

async function fetchWikipediaSummary(title: string): Promise<WikipediaSummary | null> {
  const encoded = encodeURIComponent(title.replace(/ /g, '_'));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
  const res = await fetchWithTimeout(url, {}, 12000);
  if (!res.ok) return null;
  return res.json();
}

/** Try to get the Wikipedia thumbnail for this entity. Falls back to null. */
async function getWikipediaImage(title: string): Promise<string | null> {
  const summary = await fetchWikipediaSummary(title);
  // Prefer original, fall back to thumbnail (min 200px wide)
  const img = summary?.originalimage?.source ?? summary?.thumbnail?.source;
  if (!img) return null;
  // Check it's not a placeholder/icon (they're usually <50px)
  if (summary?.thumbnail && summary.thumbnail.width < 80) return null;
  return img;
}

/** Generate an AI silhouette/portrait using OpenAI DALL-E 3 */
async function generateDallE3Image(name: string, entityType: string, description: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const prompt = entityType === 'person'
    ? `Dark noir silhouette portrait. Subject: ${name}. ${description ? `Context: ${description}.` : ''} Style: dramatic black background, high-contrast noir silhouette, cinematic, mysterious. NOT a photograph. Square format.`
    : entityType === 'organization'
    ? `Dark minimalist logo/symbol for ${name}. ${description ? `Context: ${description}.` : ''} Style: stark black background, geometric icon, corporate noir aesthetic. Square format.`
    : `Dark dramatic scene representing the event: ${name}. ${description ? `Context: ${description}.` : ''} Style: noir cinematic, symbolic, black background. Square format.`;

  const res = await fetchWithTimeout('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
      response_format: 'url',
    }),
  }, 60000);

  if (!res.ok) {
    const err = await res.text();
    console.error('DALL-E 3 error:', err.slice(0, 200));
    return null;
  }
  const data = await res.json();
  return data.data?.[0]?.url ?? null;
}

/** Generate using Replicate FLUX as secondary fallback */
async function generateFluxImage(name: string, entityType: string): Promise<string | null> {
  const apiToken = process.env.REPLICATE_API_TOKEN;
  if (!apiToken) return null;

  const prompt = entityType === 'person'
    ? `Dramatic dark silhouette portrait, ${name}, stark black background, noir style, high contrast, cinematic`
    : entityType === 'organization'
    ? `Dark minimalist icon symbol for ${name}, black background, geometric shapes, corporate`
    : `Dark cinematic scene representing ${name}, black background, symbolic, dramatic`;

  const res = await fetchWithTimeout('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
    method: 'POST',
    headers: { 'Authorization': `Token ${apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { prompt, aspect_ratio: '1:1', output_format: 'webp', output_quality: 80, num_inference_steps: 4 },
    }),
  }, 15000);

  if (!res.ok) return null;
  const prediction = await res.json();
  const pollUrl = prediction.urls?.get;
  if (!pollUrl) return null;

  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const poll = await fetchWithTimeout(pollUrl, { headers: { 'Authorization': `Token ${apiToken}` } }, 10000);
    const result = await poll.json();
    if (result.status === 'succeeded' && result.output?.[0]) return result.output[0] as string;
    if (result.status === 'failed') return null;
  }
  return null;
}

/**
 * Image strategy:
 * 1. Wikipedia thumbnail (real photo, free, accurate)
 * 2. DALL-E 3 noir silhouette (OpenAI API)
 * 3. Replicate FLUX (fallback)
 */
async function getEntityImage(
  name: string,
  entityType: string,
  description: string,
  wikipediaTitle: string | null,
): Promise<string | null> {
  // 1. Try Wikipedia image first (real photo for known figures)
  if (wikipediaTitle) {
    const wpImage = await getWikipediaImage(wikipediaTitle);
    if (wpImage) return wpImage;
  }

  // 2. DALL-E 3 noir silhouette
  const dalle = await generateDallE3Image(name, entityType, description);
  if (dalle) return dalle;

  // 3. Replicate FLUX
  return generateFluxImage(name, entityType);
}

async function uploadImageToStorage(imageUrl: string, entityId: string): Promise<string | null> {
  const sb = getAdminClient();
  const res = await fetchWithTimeout(imageUrl, {}, 15000);
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
  const sb = getAdminClient();
  // Auth check
  const secret = request.headers.get('x-cron-secret');
  const vercelCron = request.headers.get('x-vercel-cron');
  const querySecret = new URL(request.url).searchParams.get('secret');
  if (vercelCron !== '1' && secret !== process.env.CRON_SECRET && querySecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Pick up to 3 pending items that are ready to retry.
  const nowIso = new Date().toISOString();
  const { data: items } = await sb
    .from('entity_queue')
    .select('*')
    .eq('status', 'pending')
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .order('created_at')
    .limit(3);

  if (!items?.length) return NextResponse.json({ processed: 0 });

  const results = [];

  for (const item of items) {
    const attempts = Number(item.attempts ?? 0) + 1;
    // Mark as processing
    await sb.from('entity_queue').update({
      status: 'processing',
      attempts,
      error: null,
      last_error_code: null,
    }).eq('id', item.id);

    try {
      let name = item.name;
      let description = '';
      let summary = '';
      let wikipediaUrl = item.wikipedia_url ?? null;
      let wikidataId = item.wikidata_id ?? null;
      let country = null;
      let birthDate = null;
      let deathDate = null;
      let foundedDate = null;
      let endedDate = null;

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

          // Extract dates from Wikidata claims:
          // P569 = birth, P570 = death, P571 = inception/start, P576 = end/dissolution
          const birthClaim = wd.claims?.P569?.[0]?.mainsnak?.datavalue?.value?.time as string | undefined;
          const deathClaim = wd.claims?.P570?.[0]?.mainsnak?.datavalue?.value?.time as string | undefined;
          const inceptionClaim = wd.claims?.P571?.[0]?.mainsnak?.datavalue?.value?.time as string | undefined;
          const endedClaim = wd.claims?.P576?.[0]?.mainsnak?.datavalue?.value?.time as string | undefined;
          const eventStartClaim = wd.claims?.P580?.[0]?.mainsnak?.datavalue?.value?.time as string | undefined;
          const eventEndClaim = wd.claims?.P582?.[0]?.mainsnak?.datavalue?.value?.time as string | undefined;
          birthDate = parseWikidataDate(birthClaim);
          deathDate = parseWikidataDate(deathClaim);
          foundedDate = parseWikidataDate(eventStartClaim ?? inceptionClaim);
          endedDate = parseWikidataDate(eventEndClaim ?? endedClaim);

          // Country (P17 = country, P27 = country of citizenship)
          const countryClaim = wd.claims?.P27?.[0] ?? wd.claims?.P17?.[0];
          if (countryClaim) {
            // We'd need another lookup to get the ISO code — skip for now
          }
        }
      }

      // Fetch Wikipedia summary (and thumbnail) for longer description
      let wpTitle: string | null = null;
      if (wikipediaUrl) {
        wpTitle = decodeURIComponent(wikipediaUrl.split('/wiki/').pop() ?? '');
        const wpData = await fetchWikipediaSummary(wpTitle);
        if (wpData) {
          if (wpData.extract) {
            summary = wpData.extract.slice(0, 600);
            if (!description) description = wpData.extract.slice(0, 150);
          }
        }
      }

      // Create the entity record (or find existing)
      const slug = slugify(name) + (wikidataId ? `-${wikidataId.toLowerCase()}` : '');
      const { data: existingByWikidata } = wikidataId
        ? await sb.from('entities').select('id').eq('wikidata_id', wikidataId).maybeSingle()
        : { data: null as { id: string } | null };
      const { data: existingEntity } = existingByWikidata?.id
        ? { data: existingByWikidata }
        : await sb.from('entities').select('id').eq('slug', slug).maybeSingle();

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
          founded_date: foundedDate,
          ended_date: endedDate,
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

      // Generate image: Wikipedia → DALL-E 3 → FLUX fallback
      const imageUrl = await getEntityImage(
        name,
        item.entity_type ?? 'person',
        description,
        wpTitle,
      );
      if (imageUrl && entityId) {
        // If it's a Wikipedia URL, store directly (already public + permanent)
        const isWikipediaImage = imageUrl.includes('wikimedia.org') || imageUrl.includes('wikipedia.org');
        const storedUrl = isWikipediaImage
          ? imageUrl
          : await uploadImageToStorage(imageUrl, entityId);
        if (storedUrl) {
          await sb.from('entities').update({ image_url: storedUrl }).eq('id', entityId);
        }
      }

      // Mark queue item done
      await sb.from('entity_queue').update({
        status: 'done',
        processed_at: new Date().toISOString(),
        result_entity: entityId,
        next_attempt_at: null,
      }).eq('id', item.id);

      results.push({ id: item.id, name, entityId, ok: true });

    } catch (err: any) {
      const message = err?.name === 'AbortError' ? 'Request timeout' : (err?.message ?? 'Unknown queue error');
      const errorCode = errorCodeFromMessage(message);
      const shouldRetry = attempts < MAX_ATTEMPTS;
      await sb.from('entity_queue').update({
        status: shouldRetry ? 'pending' : 'failed',
        error: message,
        last_error_code: errorCode,
        next_attempt_at: shouldRetry ? nextRetryAtIso(attempts) : null,
        processed_at: shouldRetry ? null : new Date().toISOString(),
      }).eq('id', item.id);
      results.push({ id: item.id, name: item.name, ok: false, error: message, errorCode, attempts, retrying: shouldRetry });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}

// Also handle GET for manual trigger from browser
export async function GET(request: Request) {
  return POST(request);
}
