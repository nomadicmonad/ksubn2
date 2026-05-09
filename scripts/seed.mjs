import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || SUPABASE_URL.includes('your_supabase_project_url') || SERVICE_KEY.includes('your_service_role_key')) {
  console.error('Missing real NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment/.env.local');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const slugify = (text) => text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const extractDomain = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

async function importEntities(entities) {
  const nameToId = new Map();
  const rows = entities.map(e => ({
    slug: slugify(e.name) + (e.wikidata_id ? `-${e.wikidata_id.toLowerCase()}` : `-${Date.now()}`),
    type: e.type,
    name: e.name,
    description: e.description?.slice(0, 300) || null,
    summary: e.summary?.slice(0, 1000) || null,
    wikidata_id: e.wikidata_id || null,
    wikipedia_url: e.wikipedia_url || null,
    birth_date: e.birth_date || null,
    death_date: e.death_date || null,
    founded_date: e.founded_date || null,
    ended_date: e.ended_date || null,
    country: e.country || null,
    tags: e.tags ?? [],
    aliases: [],
    is_public: true,
    is_bulkbot: true,
    created_by: null,
  }));

  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { data, error } = await sb.from('entities').upsert(batch, { onConflict: 'slug', ignoreDuplicates: false }).select('id, name');
    if (error) {
      console.error(`Entity batch ${i}-${i + 50} error:`, error.message);
      continue;
    }
    for (const row of data ?? []) nameToId.set(row.name.toLowerCase(), row.id);
  }

  const { data: all } = await sb.from('entities').select('id, name').eq('is_bulkbot', true);
  for (const row of all ?? []) nameToId.set(row.name.toLowerCase(), row.id);
  return nameToId;
}

async function verifySchema() {
  // Fast readiness check so we fail early with an actionable message.
  const { error } = await sb.from('entities').select('id').limit(1);
  if (error && String(error.message).includes("Could not find the table 'public.entities'")) {
    throw new Error(
      "Supabase schema is not applied. Run /Users/niklas/ksubn/supabase/schema.sql in Supabase SQL Editor first."
    );
  }
}

async function importClaims(claims, nameToId) {
  const rows = [];
  for (const c of claims) {
    const fromId = nameToId.get(c.from_entity_name.toLowerCase());
    const toId = nameToId.get(c.to_entity_name.toLowerCase());
    if (!fromId || !toId) continue;
    rows.push({
      from_entity: fromId,
      to_entity: toId,
      relation_type: c.relation_type,
      description: c.description?.slice(0, 500),
      source_url: c.source_url,
      source_domain: c.source_domain || extractDomain(c.source_url),
      date_start: c.date_start || null,
      date_end: c.date_end || null,
      is_public: true,
      is_bulkbot: true,
      created_by: null,
    });
  }

  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error } = await sb.from('claims').insert(batch);
    if (error) console.error(`Claim batch ${i}-${i + 50} error:`, error.message);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
  const entitiesFile = get('--entities');
  const claimsFile = get('--claims');

  if (!entitiesFile && !claimsFile) {
    console.error('Usage: node scripts/seed.mjs --entities entities.json [--claims claims.json]');
    process.exit(1);
  }

  await verifySchema();

  let nameToId = new Map();
  if (entitiesFile) {
    const entities = JSON.parse(readFileSync(path.resolve(entitiesFile), 'utf-8'));
    nameToId = await importEntities(entities);
  } else {
    const { data } = await sb.from('entities').select('id, name');
    for (const row of data ?? []) nameToId.set(row.name.toLowerCase(), row.id);
  }

  if (claimsFile) {
    const claims = JSON.parse(readFileSync(path.resolve(claimsFile), 'utf-8'));
    await importClaims(claims, nameToId);
  }

  console.log('Seed import complete');
}

main().catch((err) => { console.error(err); process.exit(1); });
