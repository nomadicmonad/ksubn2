import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function safeNextPath(input: string | null | undefined) {
  if (!input || !input.startsWith('/')) return '/';
  if (input.startsWith('//')) return '/';
  return input;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNextPath(searchParams.get('next'));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Check if profile needs display name setup
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('onboarding_completed, display_name')
          .eq('id', user.id)
          .single();
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
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
