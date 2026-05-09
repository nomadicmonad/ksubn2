import { Nav } from '@/components/Nav';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/types';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let profile: Profile | null = null;
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    profile = data;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Nav profile={profile} />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        {children}
      </main>
      <footer
        className="text-center py-6 text-xs"
        style={{ color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-bg-border)' }}
      >
        ksubn · map the connections ·{' '}
        <a href="https://github.com" style={{ color: 'var(--color-accent)' }}>open source</a>
      </footer>
    </div>
  );
}
