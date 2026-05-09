/**
 * GET /api/cron/daily
 * Single daily cron job (Vercel Hobby limit: 1 cron, 1 execution/day).
 * Runs at 06:00 UTC. Chains:
 *   1. /api/queue/process  — generate images for up to 3 queued entities
 *   2. /api/paths/precompute — pre-compute paths for top entity pairs
 */
import { NextResponse } from 'next/server';

function isAuthorized(request: Request): boolean {
  const vercelCron = request.headers.get('x-vercel-cron');
  const secret = request.headers.get('x-cron-secret')
    ?? new URL(request.url).searchParams.get('secret');
  return vercelCron === '1' || secret === process.env.CRON_SECRET;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const headers = { 'x-cron-secret': process.env.CRON_SECRET ?? '' };
  const results: Record<string, unknown> = {};

  // 1. Process image queue
  try {
    const qRes = await fetch(`${base}/api/queue/process`, { method: 'POST', headers });
    results.queue = await qRes.json();
  } catch (e: any) {
    results.queue = { error: e.message };
  }

  // 2. Pre-compute paths
  try {
    const pRes = await fetch(`${base}/api/paths/precompute`, { method: 'POST', headers });
    results.paths = await pRes.json();
  } catch (e: any) {
    results.paths = { error: e.message };
  }

  return NextResponse.json({ ok: true, ran_at: new Date().toISOString(), results });
}
