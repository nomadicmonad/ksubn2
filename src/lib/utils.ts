import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { RelationType } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function formatDate(date: string | null): string {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export function formatDateShort(date: string | null): string {
  if (!date) return '';
  return new Date(date).getFullYear().toString();
}

export function relClass(type: RelationType): string {
  return `rel-${type}`;
}

export function pluralize(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : (plural ?? singular + 's')}`;
}

/** Validate a URL is safe-ish (not obviously malicious) */
export function validateSourceUrl(url: string): { ok: boolean; reason?: string } {
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) return { ok: false, reason: 'Only http/https URLs allowed' };
    const bad = [/\.(exe|bat|cmd|msi|dmg|apk|sh)$/i, /javascript:/i];
    if (bad.some(r => r.test(url))) return { ok: false, reason: 'Potentially unsafe URL' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Invalid URL' };
  }
}

export const DAILY_CLAIM_LIMIT = 10;
export const DAILY_ENTITY_LIMIT = 5;
