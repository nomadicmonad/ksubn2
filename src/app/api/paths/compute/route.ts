/**
 * POST /api/paths/compute
 * BFS path computation that runs server-side and persists results to derived_paths.
 * Called from the paths page and by cron to pre-compute popular pairs.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

interface PathStep { entity_id: string; claim_id: string }

interface PathRequest { from_entity: string; to_entity: string; max_hops?: number }

export async function POST(request: Request) {
  const body: PathRequest = await request.json();
  const { from_entity, to_entity, max_hops = 4 } = body;

  if (!from_entity || !to_entity) {
    return NextResponse.json({ error: 'from_entity and to_entity required' }, { status: 400 });
  }
  if (from_entity === to_entity) {
    return NextResponse.json({ error: 'Same entity' }, { status: 400 });
  }

  // Check cache first
  const { data: cached } = await sb
    .from('derived_paths')
    .select('*')
    .or(`and(from_entity.eq.${from_entity},to_entity.eq.${to_entity}),and(from_entity.eq.${to_entity},to_entity.eq.${from_entity})`)
    .order('hops')
    .limit(1)
    .single();

  if (cached) return NextResponse.json({ path: cached, cached: true });

  // BFS
  // visited: entity_id → { path: PathStep[], via: { claim_id, source_entity } }
  const visited = new Map<string, PathStep[]>();
  visited.set(from_entity, []);
  const queue: string[] = [from_entity];

  let found: PathStep[] | null = null;

  outer:
  for (let hop = 0; hop < max_hops && queue.length > 0; hop++) {
    const level = [...queue];
    queue.length = 0;

    // Batch-fetch all edges touching any node in this level
    const { data: claims } = await sb
      .from('claims')
      .select('id, from_entity, to_entity')
      .or(`from_entity.in.(${level.join(',')}),to_entity.in.(${level.join(',')})`)
      .eq('is_public', true)
      .eq('is_hidden', false);

    for (const claim of (claims ?? [])) {
      for (const [here, next] of [
        [claim.from_entity, claim.to_entity],
        [claim.to_entity, claim.from_entity],
      ] as [string, string][]) {
        if (!level.includes(here)) continue;
        if (visited.has(next)) continue;

        const parentPath = visited.get(here)!;
        const newPath: PathStep[] = [...parentPath, { entity_id: here, claim_id: claim.id }];
        visited.set(next, newPath);
        queue.push(next);

        if (next === to_entity) {
          found = [...newPath, { entity_id: to_entity, claim_id: claim.id }];
          break outer;
        }
      }
    }
  }

  if (!found) {
    return NextResponse.json({ path: null, message: 'No path found within limit' });
  }

  const hops = Math.ceil((found.length - 1) / 2) || 1;

  // Persist
  await sb.from('derived_paths').upsert({
    from_entity,
    to_entity,
    hops,
    path: found,
    computed_at: new Date().toISOString(),
  }, { onConflict: 'from_entity,to_entity', ignoreDuplicates: false });

  return NextResponse.json({ path: { from_entity, to_entity, hops, path: found }, cached: false });
}
