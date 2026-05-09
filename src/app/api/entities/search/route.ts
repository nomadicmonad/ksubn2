import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') ?? '';
  const type = searchParams.get('type');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '12'), 50);

  const supabase = await createClient();
  let query = supabase
    .from('entities')
    .select('id, slug, name, type, description, image_url, direct_claim_count, country')
    .eq('is_public', true)
    .order('direct_claim_count', { ascending: false })
    .limit(limit);

  if (q) query = query.ilike('name', `%${q}%`);
  if (type && type !== 'all') query = query.eq('type', type);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
