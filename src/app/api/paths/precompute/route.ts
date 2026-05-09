/**
 * POST/GET /api/paths/precompute
 * Background worker: pre-computes derived_paths for popular entity pairs.
 * Protect with CRON_SECRET via header x-cron-secret or ?secret=...
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface PathStep { entity_id: string; claim_id: string }

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || url.includes('your_supabase_project_url') || key.includes('your_service_role_key')) {
    throw new Error('Supabase admin env vars are not configured.');
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function bfsPath(
  sb: any,
  fromEntity: string,
  toEntity: string,
  maxHops: number,
): Promise<PathStep[] | null> {
  const visited = new Map<string, PathStep[]>();
  visited.set(fromEntity, []);
  const queue: string[] = [fromEntity];

  let found: PathStep[] | null = null;
  outer:
  for (let hop = 0; hop < maxHops && queue.length > 0; hop++) {
    const level = [...queue];
    queue.length = 0;
    const levelSet = new Set(level);

    const { data: claims } = await sb
      .from('claims')
      .select('id, from_entity, to_entity')
      .or(`from_entity.in.(${level.join(',')}),to_entity.in.(${level.join(',')})`)
      .eq('is_public', true)
      .eq('is_hidden', false);

    for (const claim of (claims ?? []) as any[]) {
      for (const [here, next] of [
        [claim.from_entity, claim.to_entity],
        [claim.to_entity, claim.from_entity],
      ] as [string, string][]) {
        if (!levelSet.has(here)) continue;
        if (visited.has(next)) continue;
        const parentPath = visited.get(here)!;
        const newPath: PathStep[] = [...parentPath, { entity_id: here, claim_id: claim.id }];
        visited.set(next, newPath);
        queue.push(next);
        if (next === toEntity) {
          found = [...newPath, { entity_id: toEntity, claim_id: claim.id }];
          break outer;
        }
      }
    }
  }
  return found;
}

export async function POST(request: Request) {
  const headerSecret = request.headers.get('x-cron-secret');
  const vercelCron = request.headers.get('x-vercel-cron');
  const querySecret = new URL(request.url).searchParams.get('secret');
  if (vercelCron !== '1' && headerSecret !== process.env.CRON_SECRET && querySecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getAdminClient();
  const url = new URL(request.url);
  const maxHops = Number(url.searchParams.get('max_hops') ?? '5');
  const seedLimit = Number(url.searchParams.get('seed_limit') ?? '60');
  const pairsPerRun = Number(url.searchParams.get('pairs_per_run') ?? '30');

  // Popular entities as seeds
  const { data: seeds } = await sb
    .from('entities')
    .select('id')
    .eq('is_public', true)
    .order('direct_claim_count', { ascending: false })
    .limit(seedLimit);

  const seedIds = (seeds ?? []).map((s) => s.id);
  if (seedIds.length < 2) return NextResponse.json({ processed: 0, message: 'Not enough entities' });

  // Existing derived paths among these seeds
  const { data: existing } = await sb
    .from('derived_paths')
    .select('from_entity,to_entity')
    .in('from_entity', seedIds)
    .in('to_entity', seedIds);
  const existingSet = new Set((existing ?? []).map((r) => `${r.from_entity}|${r.to_entity}`));

  const candidates: Array<[string, string]> = [];
  for (let i = 0; i < seedIds.length; i++) {
    for (let j = i + 1; j < seedIds.length; j++) {
      const a = seedIds[i];
      const b = seedIds[j];
      if (existingSet.has(`${a}|${b}`) || existingSet.has(`${b}|${a}`)) continue;
      candidates.push([a, b]);
      if (candidates.length >= pairsPerRun) break;
    }
    if (candidates.length >= pairsPerRun) break;
  }

  const results: Array<{ from: string; to: string; hops?: number; ok: boolean }> = [];
  for (const [from, to] of candidates) {
    const path = await bfsPath(sb, from, to, maxHops);
    if (!path) {
      results.push({ from, to, ok: false });
      continue;
    }
    const hops = Math.max(1, path.length - 1);
    await sb.from('derived_paths').upsert({
      from_entity: from,
      to_entity: to,
      hops,
      path,
      computed_at: new Date().toISOString(),
    }, { onConflict: 'from_entity,to_entity', ignoreDuplicates: false });
    results.push({ from, to, hops, ok: true });
  }

  return NextResponse.json({
    processed: results.length,
    computed: results.filter(r => r.ok).length,
    misses: results.filter(r => !r.ok).length,
    max_hops: maxHops,
    seed_limit: seedLimit,
    pairs_per_run: pairsPerRun,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
