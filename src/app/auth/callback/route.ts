import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

function safeNextPath(input: string | null | undefined) {
  if (!input || !input.startsWith('/')) return '/';
  if (input.startsWith('//')) return '/';
  return input;
}

function getOrigin(request: Request): string {
  // On Vercel, request.url origin may be HTTP — use forwarded headers instead
  const host =
    request.headers.get('x-forwarded-host') ??
    request.headers.get('host') ??
    new URL(request.url).host;
  const proto =
    request.headers.get('x-forwarded-proto')?.split(',')[0] ??
    (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNextPath(searchParams.get('next'));
  const origin = getOrigin(request);

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('onboarding_completed, display_name')
      .eq('id', user.id)
      .maybeSingle();
    const profileRow = profile as { onboarding_completed?: boolean; display_name?: string | null } | null;
    const onboardingDone = profileError
      ? Boolean(profileRow?.display_name)
      : (profileRow?.onboarding_completed ?? Boolean(profileRow?.display_name));
    if (!onboardingDone) {
      return NextResponse.redirect(`${origin}/onboarding?next=${encodeURIComponent(next)}`);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
