#!/usr/bin/env node
/**
 * ksubn seed script
 * Usage: npx tsx scripts/seed.ts --entities path/to/entities.json --claims path/to/claims.json
 *
 * Reads the JSON files output by the agent expansion pipeline and imports
 * them into Supabase. All records are tagged is_bulkbot=true.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

interface SeedEntity {
  name: string;
  type: 'person' | 'organization' | 'event';
  description: string;
  summary: string;
  wikidata_id: string | null;
  wikipedia_url: string | null;
  birth_date: string | null;
  death_date: string | null;
  founded_date: string | null;
  ended_date: string | null;
  country: string | null;
  tags: string[];
  entity_type_tag?: string;
}

interface SeedClaim {
  from_entity_name: string;
  to_entity_name: string;
  relation_type: string;
  description: string;
  source_url: string;
  source_domain?: string;
  date_start: string | null;
  date_end: string | null;
}

async function importEntities(entities: SeedEntity[]): Promise<Map<string, string>> {
  const nameToId = new Map<string, string>();
  console.log(`\nImporting ${entities.length} entities…`);

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

  // Batch insert (50 at a time to avoid payload limits)
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { data, error } = await sb
      .from('entities')
      .upsert(batch, { onConflict: 'slug', ignoreDuplicates: false })
      .select('id, name');

    if (error) {
      console.error(`Entity batch ${i}-${i + 50} error:`, error.message);
      continue;
    }

    for (const row of data ?? []) {
      nameToId.set(row.name.toLowerCase(), row.id);
    }
    process.stdout.write(`  ${Math.min(i + 50, rows.length)}/${rows.length}\r`);
  }

  // Re-fetch all by name for name lookup
  const { data: all } = await sb.from('entities').select('id, name').eq('is_bulkbot', true);
  for (const row of all ?? []) nameToId.set(row.name.toLowerCase(), row.id);

  console.log(`\n  ✓ ${nameToId.size} entities mapped`);
  return nameToId;
}

async function importClaims(claims: SeedClaim[], nameToId: Map<string, string>): Promise<void> {
  console.log(`\nImporting ${claims.length} claims…`);
  let imported = 0, skipped = 0;

  const rows = [];
  for (const c of claims) {
    const fromId = nameToId.get(c.from_entity_name.toLowerCase());
    const toId = nameToId.get(c.to_entity_name.toLowerCase());
    if (!fromId || !toId) {
      skipped++;
      continue;
    }
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
    if (error) {
      console.error(`Claim batch error:`, error.message);
      skipped += batch.length;
    } else {
      imported += batch.length;
    }
    process.stdout.write(`  ${Math.min(i + 50, rows.length)}/${rows.length}\r`);
  }

  console.log(`\n  ✓ ${imported} claims imported, ${skipped} skipped (missing entities)`);
}

async function main() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : null;
  };

  const entitiesFile = get('--entities');
  const claimsFile = get('--claims');

  if (!entitiesFile && !claimsFile) {
    console.error('Usage: npx tsx scripts/seed.ts --entities entities.json [--claims claims.json]');
    process.exit(1);
  }

  let nameToId = new Map<string, string>();

  if (entitiesFile) {
    const entities: SeedEntity[] = JSON.parse(readFileSync(path.resolve(entitiesFile), 'utf-8'));
    nameToId = await importEntities(entities);
  } else {
    // Load existing entity names
    const { data } = await sb.from('entities').select('id, name');
    for (const row of data ?? []) nameToId.set(row.name.toLowerCase(), row.id);
    console.log(`Loaded ${nameToId.size} existing entities`);
  }

  if (claimsFile) {
    const claims: SeedClaim[] = JSON.parse(readFileSync(path.resolve(claimsFile), 'utf-8'));
    await importClaims(claims, nameToId);
  }

  console.log('\n✓ Seed import complete');
}

main().catch(err => { console.error(err); process.exit(1); });
