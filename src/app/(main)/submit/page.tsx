'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, ExternalLink, Plus, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Entity, RelationType } from '@/types';
import { RELATION_META } from '@/types';
import { validateSourceUrl, slugify, extractDomain, DAILY_CLAIM_LIMIT, DAILY_ENTITY_LIMIT } from '@/lib/utils';

interface WikidataResult {
  id: string;
  label: string;
  description: string;
  url: string;
}

type SearchEntityKind = 'person' | 'organization' | 'event';

function selectionStatus(entity: Entity): { label: string; color: string; bg: string } {
  if (entity.id.startsWith('custom:event:')) {
    return { label: 'Custom event', color: 'var(--color-warning)', bg: 'rgba(245,158,11,0.14)' };
  }
  if (entity.id.startsWith('wikidata:')) {
    return { label: 'Wikidata selected', color: 'var(--color-accent)', bg: 'var(--color-accent-dim)' };
  }
  return { label: 'Exists in ksubn', color: 'var(--color-success)', bg: 'rgba(34,197,94,0.14)' };
}

async function searchWikidata(query: string): Promise<WikidataResult[]> {
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&limit=6&format=json&origin=*`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.search ?? []).map((r: any) => ({
    id: r.id,
    label: r.label,
    description: r.description ?? '',
    url: r.url,
  }));
}

function EntitySearchInput({
  label,
  value,
  onChange,
  entityKind,
  onEntityKindChange,
}: {
  label: string;
  value: Entity | null;
  onChange: (e: Entity | null) => void;
  entityKind: SearchEntityKind;
  onEntityKindChange: (kind: SearchEntityKind) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Entity[]>([]);
  const [wdResults, setWdResults] = useState<WikidataResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setWdResults([]); setOpen(false); return; }
    setLoading(true);
    setOpen(true);
    const sb = createClient();
    const { data } = await sb.from('entities').select('*').eq('is_public', true).ilike('name', `%${q}%`).limit(8);
    setResults(((data ?? []) as Entity[]).filter((item) => item.type === entityKind));
    const wd = await searchWikidata(q);
    setWdResults(wd);
    setLoading(false);
  }, [entityKind]);

  function handleChange(v: string) {
    setQuery(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => search(v), 300);
  }

  if (value) {
    const status = selectionStatus(value);
    return (
      <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--color-bg-hover)', border: '1px solid var(--color-bg-border)' }}>
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{value.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs capitalize" style={{ color: 'var(--color-text-muted)' }}>{value.type}</p>
            <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ color: status.color, background: status.bg, border: `1px solid ${status.color}33` }}>
              {status.label}
            </span>
          </div>
        </div>
        <button onClick={() => onChange(null)} className="btn-ghost text-xs py-1">Change</button>
      </div>
    );
  }

  return (
    <div className="relative">
      <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-primary)' }}>{label}</label>
      <div className="flex gap-1.5 mb-2">
        {(['person', 'organization', 'event'] as SearchEntityKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => onEntityKindChange(kind)}
            className="text-xs px-2 py-1 rounded"
            style={{
              border: entityKind === kind ? '1px solid var(--color-accent)' : '1px solid var(--color-bg-border)',
              color: entityKind === kind ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              background: entityKind === kind ? 'var(--color-accent-dim)' : 'var(--color-bg-surface)',
            }}
          >
            {kind}
          </button>
        ))}
      </div>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
        <input
          className="input pl-8"
          value={query}
          onChange={e => handleChange(e.target.value)}
          placeholder="Search ksubn or Wikipedia…"
          onFocus={() => query && setOpen(true)}
        />
      </div>

      {open && (results.length > 0 || wdResults.length > 0 || loading) && (
        <div
          className="absolute z-20 w-full mt-1 rounded-xl shadow-lg overflow-hidden"
          style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-bg-border)' }}
        >
          {loading && <div className="px-4 py-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>Searching…</div>}

          {results.length > 0 && (
            <div>
              <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>In ksubn</p>
              {results.map(e => (
                <button
                  key={e.id}
                  onClick={() => { onChange(e); setOpen(false); setQuery(''); }}
                  className="w-full text-left px-4 py-2.5 hover:bg-[var(--color-bg-hover)] transition-colors"
                >
                  <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{e.name}</p>
                  <p className="text-xs capitalize" style={{ color: 'var(--color-text-muted)' }}>{e.type} · {e.direct_claim_count} connections</p>
                </button>
              ))}
            </div>
          )}

          {wdResults.length > 0 && (
            <div className="border-t" style={{ borderColor: 'var(--color-bg-border)' }}>
              <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                From Wikidata (will be added)
              </p>
              {wdResults.map(wd => (
                <button
                  key={wd.id}
                  onClick={() => {
                    // Create a stub entity to be created on submit
                    onChange({
                      id: `wikidata:${wd.id}`,
                      slug: slugify(wd.label),
                      type: entityKind,
                      name: wd.label,
                      description: wd.description,
                      summary: null,
                      wikidata_id: wd.id,
                      wikipedia_url: wd.url || null,
                      image_url: null,
                      birth_date: null, death_date: null, founded_date: null, ended_date: null,
                      country: null, tags: [], aliases: [], is_public: true,
                      created_at: '', updated_at: '', created_by: null, is_bulkbot: false,
                      direct_claim_count: 0,
                    } as Entity);
                    setOpen(false);
                    setQuery('');
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-[var(--color-bg-hover)] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Plus size={12} style={{ color: 'var(--color-accent)' }} />
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{wd.label}</p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{wd.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {entityKind === 'event' && query.trim().length > 1 && (
            <div className="border-t" style={{ borderColor: 'var(--color-bg-border)' }}>
              <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                Create event (flexible)
              </p>
              <button
                onClick={() => {
                  onChange({
                    id: `custom:event:${slugify(query)}`,
                    slug: slugify(query),
                    type: 'event',
                    name: query.trim(),
                    description: null,
                    summary: null,
                    wikidata_id: null,
                    wikipedia_url: null,
                    image_url: null,
                    birth_date: null, death_date: null, founded_date: null, ended_date: null,
                    country: null, tags: [], aliases: [], is_public: true,
                    created_at: '', updated_at: '', created_by: null, is_bulkbot: false,
                    direct_claim_count: 0,
                  } as Entity);
                  setOpen(false);
                  setQuery('');
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-[var(--color-bg-hover)] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Plus size={12} style={{ color: 'var(--color-accent)' }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{query.trim()}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Create as new event</p>
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SubmitPage() {
  const router = useRouter();
  const params = useSearchParams();

  const [fromEntity, setFromEntity] = useState<Entity | null>(null);
  const [toEntity, setToEntity] = useState<Entity | null>(null);
  const [fromKind, setFromKind] = useState<SearchEntityKind>('person');
  const [toKind, setToKind] = useState<SearchEntityKind>('organization');
  const [relType, setRelType] = useState<RelationType>('same_org_event');
  const [description, setDescription] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [urlError, setUrlError] = useState('');

  function validateUrl(url: string) {
    if (!url) { setUrlError(''); return; }
    const { ok, reason } = validateSourceUrl(url);
    setUrlError(ok ? '' : (reason ?? 'Invalid URL'));
  }

  async function ensureEntity(entity: Entity, sb: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<{ id: string; created: boolean }> {
    if (entity.id.startsWith('custom:event:')) {
      const eventSlug = `${slugify(entity.name)}-event`;
      const { data: existing } = await sb.from('entities').select('id').eq('slug', eventSlug).maybeSingle();
      if (existing?.id) return { id: existing.id, created: false };
      const { data, error } = await sb.from('entities').insert({
        slug: eventSlug,
        type: 'event',
        name: entity.name,
        description: entity.description,
        is_public: true,
        is_bulkbot: false,
        created_by: userId,
      }).select('id').single();
      if (error) throw new Error(error.message);
      await sb.from('entity_queue').insert({
        name: entity.name,
        entity_type: 'event',
        submitted_by: userId,
      });
      return { id: data.id, created: true };
    }

    if (!entity.id.startsWith('wikidata:')) return { id: entity.id, created: false };

    if (entity.wikidata_id) {
      const { data: existingByWikidata } = await sb
        .from('entities')
        .select('id')
        .eq('wikidata_id', entity.wikidata_id)
        .maybeSingle();
      if (existingByWikidata?.id) return { id: existingByWikidata.id, created: false };
    }

    // Need to create a new entity for this Wikidata item
    const slug = slugify(entity.name);
    const { data, error } = await sb.from('entities').upsert({
      slug: `${slug}-${entity.wikidata_id}`,
      type: entity.type,
      name: entity.name,
      description: entity.description,
      wikidata_id: entity.wikidata_id,
      is_public: true,
      is_bulkbot: false,
      created_by: userId,
    }, { onConflict: 'slug' }).select('id, created_by').single();

    if (error) throw new Error(error.message);

    const created = data?.created_by === userId;
    if (created) {
      // Queue for AI profile generation only for newly created entities.
      await sb.from('entity_queue').insert({
        wikidata_id: entity.wikidata_id,
        name: entity.name,
        entity_type: entity.type,
        submitted_by: userId,
      });
    }

    return { id: data.id, created };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fromEntity || !toEntity) { setError('Please select both entities'); return; }
    if ((fromEntity.type === 'person' || fromEntity.type === 'organization') && fromEntity.id.startsWith('custom:')) {
      setError('People and organizations must be linked to existing entities or Wikidata/Wikipedia-backed entries.');
      return;
    }
    if ((toEntity.type === 'person' || toEntity.type === 'organization') && toEntity.id.startsWith('custom:')) {
      setError('People and organizations must be linked to existing entities or Wikidata/Wikipedia-backed entries.');
      return;
    }
    if (!description.trim()) { setError('Please add a description'); return; }
    const urlCheck = validateSourceUrl(sourceUrl);
    if (!urlCheck.ok) { setError(urlCheck.reason ?? 'Invalid URL'); return; }

    setLoading(true);
    setError('');
    try {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.push('/login?next=/submit'); return; }

      // Check daily rate limits
      const { data: profile } = await sb
        .from('profiles')
        .select('submissions_today, entities_today, last_reset_date, is_banned')
        .eq('id', user.id)
        .single();
      if (profile) {
        if (profile.is_banned) {
          setError('Your account is currently restricted and cannot submit claims.');
          setLoading(false);
          return;
        }
        const today = new Date().toISOString().slice(0, 10);
        const count = profile.last_reset_date === today ? profile.submissions_today : 0;
        const entityCount = profile.last_reset_date === today ? profile.entities_today : 0;
        if (count >= DAILY_CLAIM_LIMIT) {
          setError(`You have reached the daily limit of ${DAILY_CLAIM_LIMIT} claims. Try again tomorrow.`);
          setLoading(false);
          return;
        }

        const needsFromNew = fromEntity.id.startsWith('wikidata:') || fromEntity.id.startsWith('custom:event:');
        const needsToNew = toEntity.id.startsWith('wikidata:') || toEntity.id.startsWith('custom:event:');
        const newRequested = Number(needsFromNew) + Number(needsToNew);
        if (entityCount + newRequested > DAILY_ENTITY_LIMIT) {
          setError(`This submission would exceed your daily new-entity limit of ${DAILY_ENTITY_LIMIT}.`);
          setLoading(false);
          return;
        }
      }

      const sourceDomain = extractDomain(sourceUrl.trim());
      const { data: sitePref } = await sb
        .from('site_preferences')
        .select('is_blacklisted, is_whitelisted')
        .eq('user_id', user.id)
        .eq('domain', sourceDomain)
        .maybeSingle();
      if (sitePref?.is_blacklisted && !sitePref?.is_whitelisted) {
        setError(`You have blacklisted ${sourceDomain}. Remove it from Settings to submit this source.`);
        setLoading(false);
        return;
      }

      const [fromEntityResult, toEntityResult] = await Promise.all([
        ensureEntity(fromEntity, sb, user.id),
        ensureEntity(toEntity, sb, user.id),
      ]);

      const fromId = fromEntityResult.id;
      const toId = toEntityResult.id;

      const { error: insertError } = await sb.from('claims').insert({
        from_entity: fromId,
        to_entity: toId,
        relation_type: relType,
        description: description.trim(),
        source_url: sourceUrl.trim(),
        source_domain: sourceDomain,
        date_start: dateStart || null,
        date_end: dateEnd || null,
        created_by: user.id,
        is_public: true,
      });

      if (insertError) throw new Error(insertError.message);

      // Increment daily counter
      await sb.rpc('increment_submission_count', { user_uuid: user.id });
      const createdEntityCount = Number(fromEntityResult.created) + Number(toEntityResult.created);
      if (createdEntityCount > 0) {
        await Promise.all(
          Array.from({ length: createdEntityCount }).map(() =>
            sb.rpc('increment_entity_count', { user_uuid: user.id }),
          ),
        );
      }

      router.push(`/entity/${fromEntity.slug}`);
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Submit a connection</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Link two entities with a sourced claim. Limit: 10 claims per day.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-6">
        {error && (
          <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-danger)', border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}

        {/* Entity pair */}
        <div className="space-y-3">
          <h2 className="font-medium" style={{ color: 'var(--color-text-primary)' }}>Connect…</h2>
          <EntitySearchInput
            label="From entity"
            value={fromEntity}
            entityKind={fromKind}
            onEntityKindChange={(kind) => { setFromKind(kind); setFromEntity(null); }}
            onChange={(entity) => { setFromEntity(entity); if (entity) setFromKind(entity.type); }}
          />
          <div className="flex items-center justify-center">
            <ArrowRight size={18} style={{ color: 'var(--color-text-muted)' }} />
          </div>
          <EntitySearchInput
            label="To entity"
            value={toEntity}
            entityKind={toKind}
            onEntityKindChange={(kind) => { setToKind(kind); setToEntity(null); }}
            onChange={(entity) => { setToEntity(entity); if (entity) setToKind(entity.type); }}
          />
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            People/organizations require ontology binding (existing DB or Wikidata). Events can be created if no match exists.
          </p>
        </div>

        {/* Relation type */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
            Type of connection
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(Object.entries(RELATION_META) as [RelationType, typeof RELATION_META[RelationType]][]).map(([type, meta]) => (
              <button
                key={type}
                type="button"
                onClick={() => setRelType(type)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left transition-all"
                style={{
                  background: relType === type ? `${meta.color}20` : 'var(--color-bg-surface)',
                  border: relType === type ? `1px solid ${meta.color}50` : '1px solid var(--color-bg-border)',
                  color: relType === type ? meta.color : 'var(--color-text-secondary)',
                }}
              >
                <span>{meta.icon}</span>
                {meta.label}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
            Description <span style={{ color: 'var(--color-text-muted)' }}>— what is the connection?</span>
          </label>
          <textarea
            className="input resize-none"
            style={{ minHeight: '80px' }}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="e.g. Both attended the 2019 Bilderberg meeting in Montreux, Switzerland, as confirmed by the official attendee list."
            maxLength={500}
          />
          <p className="text-xs text-right" style={{ color: 'var(--color-text-muted)' }}>{description.length}/500</p>
        </div>

        {/* Source URL */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
            Source URL <span style={{ color: 'var(--color-danger)' }}>*</span>
          </label>
          <div className="relative">
            <ExternalLink size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
            <input
              type="url"
              className="input pl-8"
              value={sourceUrl}
              onChange={e => { setSourceUrl(e.target.value); validateUrl(e.target.value); }}
              placeholder="https://nytimes.com/…"
            />
          </div>
          {urlError && <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{urlError}</p>}
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Must be a real news article, Wikipedia page, or official document.</p>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>From date</label>
            <input type="date" className="input" value={dateStart} onChange={e => setDateStart(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>To date</label>
            <input type="date" className="input" value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !fromEntity || !toEntity || !description.trim() || !sourceUrl || !!urlError}
          className="btn-primary w-full justify-center"
        >
          {loading ? 'Submitting…' : 'Submit connection'}
        </button>
      </form>
    </div>
  );
}
