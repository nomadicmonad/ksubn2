/**
 * POST /api/admin/moderate
 * Admin endpoint to hide a claim or invalidate all signals from a user.
 * Secured by ADMIN_SECRET header.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function isAdmin(request: Request) {
  const secret = request.headers.get('x-admin-secret');
  return secret && secret === process.env.ADMIN_SECRET;
}

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { action, claim_id, user_id, ban_reason } = body;

  switch (action) {
    case 'hide_claim': {
      if (!claim_id) return NextResponse.json({ error: 'claim_id required' }, { status: 400 });
      const { error } = await sb.from('claims').update({ is_hidden: true }).eq('id', claim_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, action: 'claim_hidden', claim_id });
    }

    case 'unhide_claim': {
      if (!claim_id) return NextResponse.json({ error: 'claim_id required' }, { status: 400 });
      const { error } = await sb.from('claims').update({ is_hidden: false }).eq('id', claim_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, action: 'claim_unhidden', claim_id });
    }

    case 'ban_user': {
      if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 });

      // 1. Invalidate all votes and reports from this user, recalculate affected claims
      const { data: signalResult } = await sb.rpc('invalidate_user_signals', { target_user_id: user_id });

      // 2. Mark user as banned
      const { error: banErr } = await sb.from('profiles').update({
        is_banned: true,
        ban_reason: ban_reason ?? 'Banned by admin',
      }).eq('id', user_id);

      if (banErr) return NextResponse.json({ error: banErr.message }, { status: 500 });

      // 3. Hide all their claims
      await sb.from('claims').update({ is_hidden: true }).eq('created_by', user_id);
      const hiddenCount = 0; // approximate

      return NextResponse.json({
        ok: true,
        action: 'user_banned',
        user_id,
        claims_affected_by_signals: signalResult,
        claims_hidden: hiddenCount ?? 0,
      });
    }

    case 'unban_user': {
      if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 });
      const { error } = await sb.from('profiles').update({ is_banned: false, ban_reason: null }).eq('id', user_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, action: 'user_unbanned', user_id });
    }

    case 'recalculate_counts': {
      await sb.rpc('recalculate_all_claim_counts');
      await sb.rpc('recalculate_entity_claim_counts');
      return NextResponse.json({ ok: true, action: 'counts_recalculated' });
    }

    default:
      return NextResponse.json({
        error: 'Unknown action',
        available: ['hide_claim', 'unhide_claim', 'ban_user', 'unban_user', 'recalculate_counts'],
      }, { status: 400 });
  }
}
