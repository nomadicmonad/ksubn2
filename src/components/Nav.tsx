'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Network, Search, GitBranch, Clock, Globe, BookMarked,
  PlusCircle, Star, Settings, LogIn, Menu, X, LogOut,
  ChevronDown, Activity,
} from 'lucide-react';
import type { Profile } from '@/types';

const NAV_LINKS = [
  { href: '/search',   label: 'Explore',  icon: Search },
  { href: '/graph',    label: 'Graph',    icon: Network },
  { href: '/paths',    label: 'Paths',    icon: GitBranch },
  { href: '/timeline', label: 'Timeline', icon: Clock },
  { href: '/topics',   label: 'Topics',   icon: Globe },
  { href: '/recent',   label: 'Recent',   icon: Activity },
];

interface NavProps { profile: Profile | null }

export function Nav({ profile }: NavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <header
      style={{ background: 'rgba(8,8,14,0.9)', borderBottom: '1px solid var(--color-bg-border)' }}
      className="sticky top-0 z-50 backdrop-blur-md"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <span style={{ color: 'var(--color-text-primary)' }} className="font-bold text-lg tracking-tight">
              K<span style={{ color: 'var(--color-accent)' }}>n</span>
            </span>
            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }} className="hidden sm:block">
              ksubn
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                style={{
                  color: isActive(href) ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  background: isActive(href) ? 'var(--color-bg-hover)' : 'transparent',
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
              >
                <Icon size={14} />
                {label}
              </Link>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {profile ? (
              <>
                {profile.is_banned ? (
                  <span
                    className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
                    style={{ background: 'rgba(239,68,68,0.14)', color: 'var(--color-danger)', border: '1px solid rgba(239,68,68,0.24)' }}
                    title="Restricted account"
                  >
                    <PlusCircle size={14} />
                    Restricted
                  </span>
                ) : (
                  <Link
                    href="/submit"
                    className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                    style={{ background: 'var(--color-accent)', color: 'white' }}
                  >
                    <PlusCircle size={14} />
                    Submit
                  </Link>
                )}

                {/* User menu */}
                <div className="relative">
                  <button
                    onClick={() => setUserMenuOpen(v => !v)}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm transition-colors hover:bg-[var(--color-bg-hover)]"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}
                    >
                      {profile.display_name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <span className="hidden sm:block max-w-24 truncate" style={{ color: 'var(--color-text-primary)' }}>
                      {profile.display_name}
                    </span>
                    <ChevronDown size={12} />
                  </button>

                  {userMenuOpen && (
                    <div
                      className="absolute right-0 mt-1 w-44 rounded-xl shadow-lg py-1 z-50"
                      style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-bg-border)' }}
                    >
                      <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--color-bg-border)' }}>
                        <p className="text-xs font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{profile.display_name}</p>
                        <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{profile.at_name}</p>
                      </div>
                      {[
                        { href: '/my/stars',       icon: Star,       label: 'My Stars' },
                        { href: '/my/submissions', icon: BookMarked, label: 'My Submissions' },
                        { href: '/settings',       icon: Settings,   label: 'Settings' },
                      ].map(({ href, icon: Icon, label }) => (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-[var(--color-bg-hover)]"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          <Icon size={13} />
                          {label}
                        </Link>
                      ))}
                      <div className="border-t mt-1 pt-1" style={{ borderColor: 'var(--color-bg-border)' }}>
                        <Link
                          href="/auth/logout"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm transition-colors hover:bg-[var(--color-bg-hover)]"
                          style={{ color: 'var(--color-danger)' }}
                        >
                          <LogOut size={13} />
                          Sign out
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-bg-border)', color: 'var(--color-text-primary)' }}
              >
                <LogIn size={14} />
                Sign in
              </Link>
            )}

            {/* Mobile menu toggle */}
            <button
              className="md:hidden p-2 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors"
              style={{ color: 'var(--color-text-secondary)' }}
              onClick={() => setOpen(v => !v)}
              aria-label="Toggle menu"
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile nav drawer */}
        {open && (
          <div
            className="md:hidden border-t py-3 space-y-1 animate-fade-in"
            style={{ borderColor: 'var(--color-bg-border)' }}
          >
            {NAV_LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
                style={{
                  color: isActive(href) ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  background: isActive(href) ? 'var(--color-bg-hover)' : 'transparent',
                }}
              >
                <Icon size={15} />
                {label}
              </Link>
            ))}
            {profile && !profile.is_banned && (
              <Link
                href="/submit"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--color-accent)', color: 'white' }}
              >
                <PlusCircle size={15} />
                Submit a claim
              </Link>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
