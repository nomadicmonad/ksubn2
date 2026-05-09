import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

function safeNextPath(input: string | null | undefined) {
  if (!input || !input.startsWith('/')) return '/';
  if (input.startsWith('//')) return '/';
  return input;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNextPath(searchParams.get('next'));

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // Build the redirect response first so we can attach cookies to it
  const redirectTo = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.headers.get('cookie')
            ? request.headers.get('cookie')!.split('; ').map(c => {
                const [name, ...rest] = c.split('=');
                return { name, value: rest.join('=') };
              })
            : [];
        },
        setAll(cookiesToSet) {
          // Write session cookies directly onto the redirect response
          cookiesToSet.forEach(({ name, value, options }) =>
            redirectTo.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // Check onboarding
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
      const r = NextResponse.redirect(`${origin}/onboarding?next=${encodeURIComponent(next)}`);
      redirectTo.cookies.getAll().forEach(c => r.cookies.set(c.name, c.value));
      return r;
    }
  }

  return redirectTo;
}
