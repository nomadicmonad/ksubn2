import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PATHS = ['/submit', '/my', '/settings', '/topics/new'];

function isProtected(pathname: string) {
  return PROTECTED_PATHS.some((path) => pathname.startsWith(path));
}

function safeNextPath(input: string | null | undefined) {
  if (!input || !input.startsWith('/')) return '/';
  if (input.startsWith('//')) return '/';
  return input;
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const pathname = request.nextUrl.pathname;
  const isApiPath = pathname.startsWith('/api');
  const { data: { user } } = await supabase.auth.getUser();

  if (!user && isProtected(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  if (user) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('onboarding_completed, display_name, is_banned')
      .eq('id', user.id)
      .maybeSingle();
    const profileRow = profile as { onboarding_completed?: boolean; display_name?: string | null; is_banned?: boolean } | null;

    const onboardingDone = profileError
      ? Boolean(profileRow?.display_name)
      : (profileRow?.onboarding_completed ?? Boolean(profileRow?.display_name));
    const banned = profileRow?.is_banned === true;
    const isOnboardingPath = pathname.startsWith('/onboarding');
    const isCallbackPath = pathname.startsWith('/auth/callback');
    const isLoginPath = pathname.startsWith('/login');
    const isBannedPath = pathname.startsWith('/banned');

    if (banned && !isBannedPath && !isCallbackPath && !isApiPath) {
      const url = request.nextUrl.clone();
      url.pathname = '/banned';
      return NextResponse.redirect(url);
    }

    if (!onboardingDone && isProtected(pathname) && !isCallbackPath && !isApiPath) {
      const url = request.nextUrl.clone();
      url.pathname = '/onboarding';
      url.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(url);
    }

    if (onboardingDone && (isLoginPath || isOnboardingPath) && !banned) {
      const redirectPath = safeNextPath(request.nextUrl.searchParams.get('next'));
      const url = request.nextUrl.clone();
      url.pathname = redirectPath === '/login' || redirectPath === '/onboarding' ? '/' : redirectPath;
      url.search = '';
      return NextResponse.redirect(url);
    }
  } else if (pathname.startsWith('/onboarding')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
