/**
 * POST /api/paths/compute
 * BFS path computation that runs server-side and persists results to derived_paths.
 * Called from the paths page and by cron to pre-compute popular pairs.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface PathStep { entity_id: string; claim_id: string }

interface PathRequest { from_entity: string; to_entity: string; max_hops?: number }

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || url.includes('your_supabase_project_url') || key.includes('your_service_role_key')) {
    throw new Error('Supabase admin env vars are not configured.');
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Returns up to maxPaths shortest paths (all same hop-count as the shortest found).
async function bfsAllPaths(
  sb: any,
  fromEntity: string,
  toEntity: string,
  maxHops: number,
  maxPaths = 5,
): Promise<PathStep[][]> {
  // Each queue entry: [currentEntityId, pathSoFar]
  // pathSoFar = steps taken to REACH current (not including current yet)
  type Entry = [string, PathStep[]];
  let queue: Entry[] = [[fromEntity, []]];
  const found: PathStep[][] = [];
  let foundAtHop = -1;

  for (let hop = 0; hop < maxHops && queue.length > 0; hop++) {
    if (foundAtHop !== -1 && hop > foundAtHop) break; // don't go deeper than shortest

    const level = [...new Set(queue.map(([id]) => id))];
    const { data: claims } = await sb
      .from('claims')
      .select('id, from_entity, to_entity')
      .or(`from_entity.in.(${level.join(',')}),to_entity.in.(${level.join(',')})`)
      .eq('is_public', true)
      .eq('is_hidden', false);

    const nextQueue: Entry[] = [];
    for (const [current, path] of queue) {
      for (const claim of (claims ?? []) as any[]) {
        for (const [here, next] of [
          [claim.from_entity, claim.to_entity],
          [claim.to_entity, claim.from_entity],
        ] as [string, string][]) {
          if (here !== current) continue;
          const visitedInPath = new Set(path.map(s => s.entity_id));
          visitedInPath.add(fromEntity);
          if (visitedInPath.has(next)) continue; // no cycles

          const newPath: PathStep[] = [...path, { entity_id: current, claim_id: claim.id }];

          if (next === toEntity) {
            found.push([...newPath, { entity_id: toEntity, claim_id: claim.id }]);
            foundAtHop = hop;
            if (found.length >= maxPaths) return found;
          } else if (foundAtHop === -1) {
            nextQueue.push([next, newPath]);
          }
        }
      }
    }
    queue = nextQueue;
  }

  return found;
}

export async function POST(request: Request) {
  const sb = getAdminClient();
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

  // Always run fresh multi-path BFS (cache stores only shortest for /paths page)
  const allPaths = await bfsAllPaths(sb, from_entity, to_entity, max_hops);

  if (allPaths.length === 0) {
    // Fall back to cache if BFS finds nothing (e.g. service role issue)
    if (cached) {
      const cIds = [...new Set((cached.path as PathStep[]).map(s => s.claim_id).filter(Boolean))];
      const { data: cd } = await sb.from('claims').select('id, relation_type, description, source_url, source_domain').in('id', cIds);
      const claimMap = Object.fromEntries((cd ?? []).map((c: any) => [c.id, c]));
      return NextResponse.json({ paths: [cached.path], claimMap, cached: true });
    }
    return NextResponse.json({ paths: [], message: 'No path found within limit' });
  }

  const shortest = allPaths[0];
  const hops = Math.max(1, shortest.length - 1);

  // Collect all claim IDs across all paths
  const claimIds = [...new Set(allPaths.flat().map(s => s.claim_id).filter(Boolean))];
  const { data: claimsData } = await sb.from('claims').select('id, relation_type, description, source_url, source_domain').in('id', claimIds);
  const claimMap = Object.fromEntries((claimsData ?? []).map((c: any) => [c.id, c]));

  // Persist shortest path for /paths page caching
  await sb.from('derived_paths').upsert({
    from_entity, to_entity, hops,
    path: shortest,
    computed_at: new Date().toISOString(),
  }, { onConflict: 'from_entity,to_entity', ignoreDuplicates: false });

  return NextResponse.json({ paths: allPaths, claimMap, cached: false });
}
