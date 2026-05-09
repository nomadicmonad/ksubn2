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

async function fetchWikipediaSummary(title: string): Promise<string | null> {
  const encoded = encodeURIComponent(title.replace(/ /g, '_'));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
  const res = await fetchWithTimeout(url, { next: { revalidate: 0 } }, 12000);
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

  const res = await fetchWithTimeout('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
    method: 'POST',
    headers: { 'Authorization': `Token ${apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { prompt, aspect_ratio: '1:1', output_format: 'webp', output_quality: 80, num_inference_steps: 4 },
    }),
  }, 15000);

  if (!res.ok) return null;
  const prediction = await res.json();

  // Poll for completion (max 30s)
  const pollUrl = prediction.urls?.get;
  if (!pollUrl) return null;

  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const poll = await fetchWithTimeout(pollUrl, { headers: { 'Authorization': `Token ${apiToken}` } }, 10000);
    const result = await poll.json();
    if (result.status === 'succeeded' && result.output?.[0]) {
      return result.output[0] as string;
    }
    if (result.status === 'failed') return null;
  }
  return null;
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
