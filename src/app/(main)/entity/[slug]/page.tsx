import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
  ExternalLink, Calendar, Globe, Tag, Link2, Users, Building2, Clock,
  Network, GitBranch,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { ClaimRow } from '@/components/entity/ClaimRow';
import { EntityCard } from '@/components/entity/EntityCard';
import { StarButton } from '@/components/entity/StarButton';
import { RELATION_META, ENTITY_TYPE_LABELS } from '@/types';
import type { Entity, ClaimWithEntity, RelationType } from '@/types';
import { formatDate } from '@/lib/utils';
import { dateNumerologyFromIso, gematria, numerologyValuesForEntity } from '@/lib/numerology';
import { getEntityDateRows, getEntityPrimaryDates } from '@/lib/entity-dates';

interface Props { params: Promise<{ slug: string }> }

async function getEntity(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('entities')
    .select('*')
    .eq('slug', slug)
    .eq('is_public', true)
    .single();
  return data as Entity | null;
}

async function getEntityClaims(entityId: string): Promise<ClaimWithEntity[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('entity_claims', { entity_uuid: entityId, limit_n: 100 });
  return (data ?? []) as ClaimWithEntity[];
}

export default async function EntityPage({ params }: Props) {
  const { slug } = await params;
  const [entity, supabase] = await Promise.all([
    getEntity(slug),
    createClient(),
  ]);

  if (!entity) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  let claims = await getEntityClaims(entity.id);
  let showNumerology = true;
  let blacklistedDomains = new Set<string>();
  let whitelistedDomains = new Set<string>();
  let blacklistedUsers = new Set<string>();
  let whitelistedUsers = new Set<string>();

  // Get user's votes and reports for these claims
  let userVotes: Record<string, number> = {};
  let userReports: Set<string> = new Set();
  let userClaimStars: Set<string> = new Set();
  if (user) {
    const claimIds = claims.map(c => c.claim_id);
    const [{ data: votes }, { data: reports }, { data: sitePrefs }, { data: userPrefs }, { data: claimStars }] = await Promise.all([
      supabase.from('claim_votes').select('claim_id, vote').in('claim_id', claimIds).eq('user_id', user.id),
      supabase.from('claim_reports').select('claim_id').in('claim_id', claimIds).eq('user_id', user.id),
      supabase.from('site_preferences').select('domain, is_blacklisted, is_whitelisted').eq('user_id', user.id),
      supabase.from('user_preferences').select('target_user_id, is_blacklisted, is_whitelisted').eq('user_id', user.id),
      supabase.from('stars').select('claim_id').eq('user_id', user.id).in('claim_id', claimIds),
    ]);
    userVotes = Object.fromEntries((votes ?? []).map(v => [v.claim_id, v.vote]));
    userReports = new Set((reports ?? []).map(r => r.claim_id));
    userClaimStars = new Set((claimStars ?? []).map(r => r.claim_id).filter(Boolean));

    blacklistedDomains = new Set((sitePrefs ?? []).filter(s => s.is_blacklisted && !s.is_whitelisted).map(s => s.domain));
    whitelistedDomains = new Set((sitePrefs ?? []).filter(s => s.is_whitelisted).map(s => s.domain));
    blacklistedUsers = new Set((userPrefs ?? []).filter(s => s.is_blacklisted && !s.is_whitelisted).map(s => s.target_user_id));
    whitelistedUsers = new Set((userPrefs ?? []).filter(s => s.is_whitelisted).map(s => s.target_user_id));

    if (claimIds.length > 0) {
      const { data: claimMeta } = await supabase
        .from('claims')
        .select('id, created_by, source_domain')
        .in('id', claimIds);
      const metaById = new Map((claimMeta ?? []).map(m => [m.id, m]));
      claims = claims.filter((c) => {
        const meta = metaById.get(c.claim_id);
        if (!meta) return true;
        if (meta.source_domain && blacklistedDomains.has(meta.source_domain) && !whitelistedDomains.has(meta.source_domain)) return false;
        if (meta.created_by && blacklistedUsers.has(meta.created_by) && !whitelistedUsers.has(meta.created_by)) return false;
        return true;
      });
    }

    const { data: viewerProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (viewerProfile && 'show_numerology' in viewerProfile && viewerProfile.show_numerology === false) showNumerology = false;
  }

  // Check if user has starred this entity
  let starred = false;
  if (user) {
    const { data } = await supabase.from('stars').select('id').eq('user_id', user.id).eq('entity_id', entity.id).single();
    starred = !!data;
  }

  // Group claims by relation type for the connections panel
  const grouped = claims.reduce<Record<string, ClaimWithEntity[]>>((acc, c) => {
    const k = c.relation_type;
    if (!acc[k]) acc[k] = [];
    acc[k].push(c);
    return acc;
  }, {});

  // Top connected entities (by frequency)
  const entityFreq = claims.reduce<Record<string, { entity: ClaimWithEntity; count: number }>>((acc, c) => {
    const id = c.other_entity_id;
    if (!acc[id]) acc[id] = { entity: c, count: 0 };
    acc[id].count++;
    return acc;
  }, {});
  const topEntities = Object.values(entityFreq).sort((a, b) => b.count - a.count).slice(0, 8);

  const typeColor = entity.type === 'person' ? 'var(--color-accent)' : entity.type === 'organization' ? 'var(--color-kpurple)' : 'var(--color-warning)';
  const TypeIcon = entity.type === 'person' ? Users : entity.type === 'organization' ? Building2 : Calendar;
  const primaryDates = getEntityPrimaryDates(entity);
  const gematriaValues = gematria(entity.name);
  const entityDateRows = getEntityDateRows(entity);

  const sharedEventPeople: Array<{ entity: ClaimWithEntity; count: number }> = [];
  const sharedEventOrgs: Array<{ entity: ClaimWithEntity; count: number }> = [];
  const sharedOrgPeople: Array<{ entity: ClaimWithEntity; count: number }> = [];
  const sharedOrgEvents: Array<{ entity: ClaimWithEntity; count: number }> = [];
  const inferredPeopleCombined: Array<{ entity: ClaimWithEntity; count: number }> = [];
  const inferredPeopleThreeHop: Array<{ entity: ClaimWithEntity; count: number }> = [];

  async function applyVisibilityFilter(rows: ClaimWithEntity[]): Promise<ClaimWithEntity[]> {
    if (rows.length === 0 || (blacklistedDomains.size === 0 && blacklistedUsers.size === 0)) return rows;
    const ids = [...new Set(rows.map(c => c.claim_id))];
    const { data: claimMeta } = await supabase
      .from('claims')
      .select('id, created_by, source_domain')
      .in('id', ids);
    const metaById = new Map((claimMeta ?? []).map(m => [m.id, m]));
    return rows.filter((c) => {
      const meta = metaById.get(c.claim_id);
      if (!meta) return true;
      if (meta.source_domain && blacklistedDomains.has(meta.source_domain) && !whitelistedDomains.has(meta.source_domain)) return false;
      if (meta.created_by && blacklistedUsers.has(meta.created_by) && !whitelistedUsers.has(meta.created_by)) return false;
      return true;
    });
  }

  function rankByType(rows: ClaimWithEntity[], targetType: 'person' | 'organization' | 'event') {
    const freq = new Map<string, { entity: ClaimWithEntity; count: number }>();
    for (const hop of rows) {
      if (hop.other_entity_type !== targetType || hop.other_entity_id === entity!.id) continue;
      const curr = freq.get(hop.other_entity_id);
      freq.set(hop.other_entity_id, { entity: hop, count: (curr?.count ?? 0) + 1 });
    }
    return [...freq.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  }

  if (entity.type === 'person') {
    const directEventIds = [...new Set(claims.filter(c => c.other_entity_type === 'event').map(c => c.other_entity_id))].slice(0, 30);
    const directOrgIds = [...new Set(claims.filter(c => c.other_entity_type === 'organization').map(c => c.other_entity_id))].slice(0, 30);
    if (directEventIds.length > 0) {
      const bundles = await Promise.all(directEventIds.map((eventId) => getEntityClaims(eventId)));
      const secondHop = await applyVisibilityFilter(bundles.flat().filter((c) => c.other_entity_id !== entity.id));
      sharedEventPeople.push(...rankByType(secondHop, 'person'));
      sharedEventOrgs.push(...rankByType(secondHop, 'organization'));
    }
    if (directOrgIds.length > 0) {
      const bundles = await Promise.all(directOrgIds.map((orgId) => getEntityClaims(orgId)));
      const secondHop = await applyVisibilityFilter(bundles.flat().filter((c) => c.other_entity_id !== entity.id));
      sharedOrgPeople.push(...rankByType(secondHop, 'person'));
      sharedOrgEvents.push(...rankByType(secondHop, 'event'));
    }

    // Combined higher-order ranking for "push this higher"
    const combined = new Map<string, { entity: ClaimWithEntity; count: number }>();
    for (const source of [...sharedEventPeople, ...sharedOrgPeople]) {
      const curr = combined.get(source.entity.other_entity_id);
      combined.set(source.entity.other_entity_id, {
        entity: source.entity,
        count: (curr?.count ?? 0) + source.count,
      });
    }
    inferredPeopleCombined.push(...[...combined.values()].sort((a, b) => b.count - a.count).slice(0, 12));

    // Third-hop boost: person -> (shared event/org) -> person -> (their links) -> person
    const seedPeople = inferredPeopleCombined.slice(0, 8).map((x) => x.entity.other_entity_id);
    if (seedPeople.length > 0) {
      const bundles = await Promise.all(seedPeople.map((personId) => getEntityClaims(personId)));
      const thirdHop = await applyVisibilityFilter(bundles.flat().filter((c) => c.other_entity_type === 'person' && c.other_entity_id !== entity.id));
      const directPeople = new Set(claims.filter(c => c.other_entity_type === 'person').map(c => c.other_entity_id));
      const combinedPeople = new Set(inferredPeopleCombined.map(c => c.entity.other_entity_id));
      const freq = new Map<string, { entity: ClaimWithEntity; count: number }>();
      for (const hop of thirdHop) {
        if (directPeople.has(hop.other_entity_id) || combinedPeople.has(hop.other_entity_id)) continue;
        const curr = freq.get(hop.other_entity_id);
        freq.set(hop.other_entity_id, { entity: hop, count: (curr?.count ?? 0) + 1 });
      }
      inferredPeopleThreeHop.push(...[...freq.values()].sort((a, b) => b.count - a.count).slice(0, 10));
    }
  }

  let similarNumericEntities: Entity[] = [];
  if (showNumerology) {
    const currentValues = new Set(numerologyValuesForEntity(entity));
    const { data: candidates } = await supabase
      .from('entities')
      .select('*')
      .eq('is_public', true)
      .neq('id', entity.id)
      .limit(200);
    similarNumericEntities = ((candidates ?? []) as Entity[])
      .filter((candidate) => numerologyValuesForEntity(candidate).some((value) => currentValues.has(value)))
      .slice(0, 8);
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Profile header */}
      <div className="card p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row gap-6">
          {/* Image / avatar */}
          <div
            className="flex-shrink-0 rounded-2xl overflow-hidden flex items-center justify-center self-start"
            style={{ width: 120, height: 120, background: `${typeColor}18`, border: `2px solid ${typeColor}30` }}
          >
            {entity.image_url ? (
              <Image src={entity.image_url} alt={entity.name} width={120} height={120} className="object-cover w-full h-full" />
            ) : (
              <TypeIcon size={48} style={{ color: typeColor }} />
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* Type badge + name */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
                style={{ background: `${typeColor}18`, color: typeColor }}
              >
                {ENTITY_TYPE_LABELS[entity.type]}
              </span>
              {entity.is_bulkbot && (
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text-muted)' }}>
                  bulkbot
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>
              {entity.name}
            </h1>

            {entity.description && (
              <p className="text-base font-medium mb-3" style={{ color: 'var(--color-text-secondary)' }}>
                {entity.description}
              </p>
            )}

            {entity.summary && (
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {entity.summary}
              </p>
            )}

            {/* Meta row */}
            <div className="flex flex-wrap gap-3 mt-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {primaryDates.start && (
                <span className="flex items-center gap-1">
                  <Calendar size={12} />
                  {primaryDates.label}: {formatDate(primaryDates.start)}
                  {primaryDates.end && ` — ${formatDate(primaryDates.end)}`}
                </span>
              )}
              {entity.country && (
                <span className="flex items-center gap-1">
                  <Globe size={12} />
                  {entity.country}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Link2 size={12} />
                {entity.direct_claim_count} connection{entity.direct_claim_count !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Actions row: star + external links */}
            <div className="flex flex-wrap gap-2 mt-4">
              <StarButton entityId={entity.id} initialStarred={starred} />
              {entity.wikipedia_url && (
                <a
                  href={entity.wikipedia_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
                  style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-bg-border)' }}
                >
                  <ExternalLink size={11} />
                  Wikipedia
                </a>
              )}
              {entity.wikidata_id && (
                <a
                  href={`https://www.wikidata.org/wiki/${entity.wikidata_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
                  style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-bg-border)' }}
                >
                  <ExternalLink size={11} />
                  Wikidata
                </a>
              )}
              <Link
                href={`/graph?focus=${entity.id}`}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
                style={{ background: 'var(--color-accent-dim)', color: 'var(--color-accent)', border: '1px solid rgba(99,102,241,0.25)' }}
              >
                <Network size={11} />
                View in graph
              </Link>
            </div>
          </div>
        </div>

        {/* Tags */}
        {entity.tags?.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-5 pt-5" style={{ borderTop: '1px solid var(--color-bg-border)' }}>
            <Tag size={13} style={{ color: 'var(--color-text-muted)' }} />
            {entity.tags.map(tag => (
              <Link
                key={tag}
                href={`/search?tag=${encodeURIComponent(tag)}`}
                className="text-xs px-2 py-0.5 rounded-full transition-colors hover:border-accent/40"
                style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text-muted)', border: '1px solid var(--color-bg-border)' }}
              >
                {tag}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Connections list */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Connections <span className="text-sm font-normal ml-1" style={{ color: 'var(--color-text-muted)' }}>({claims.length})</span>
            </h2>
            <Link
              href={`/submit?from=${entity.id}`}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: 'var(--color-accent-dim)', color: 'var(--color-accent)', border: '1px solid rgba(99,102,241,0.25)' }}
            >
              + Add connection
            </Link>
          </div>

          {Object.entries(grouped).map(([type, typeClaims]) => {
            const meta = RELATION_META[type as RelationType];
            return (
              <div key={type}>
                <h3 className="flex items-center gap-2 text-sm font-medium mb-3" style={{ color: 'var(--color-text-secondary)' }}>
                  <span>{meta.icon}</span>
                  {meta.label}
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>({typeClaims.length})</span>
                </h3>
                <div className="space-y-2">
                  {typeClaims.map(claim => (
                    <ClaimRow
                      key={claim.claim_id}
                      claim={claim}
                      currentEntityId={entity.id}
                      userVote={(userVotes[claim.claim_id] ?? 0) as -1 | 0 | 1}
                      hasReported={userReports.has(claim.claim_id)}
                      isStarred={userClaimStars.has(claim.claim_id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {claims.length === 0 && (
            <div
              className="card p-12 text-center"
            >
              <Network size={40} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--color-text-muted)' }} />
              <p style={{ color: 'var(--color-text-muted)' }}>No connections yet.</p>
              <Link href={`/submit?from=${entity.id}`} className="btn-primary mt-4 inline-flex">
                Be the first to add one
              </Link>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {showNumerology && (
            <div className="card p-4">
              <h3 className="section-title mb-3">Gematria & date numerology</h3>
              <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                {Object.entries(gematriaValues).map(([key, value]) => (
                  <div key={key} className="rounded px-2 py-1" style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)' }}>
                    <span className="capitalize">{key.replaceAll('_', ' ')}</span>: <strong style={{ color: 'var(--color-text-primary)' }}>{value}</strong>
                  </div>
                ))}
              </div>
              {entityDateRows.map((row) => {
                const dateValues = dateNumerologyFromIso(row.value);
                if (!dateValues) return null;
                return (
                  <div key={row.label} className="rounded px-2 py-1.5 text-xs mb-2" style={{ background: 'var(--color-bg-hover)' }}>
                    <p style={{ color: 'var(--color-text-secondary)' }}>{row.label}: <span style={{ color: 'var(--color-text-primary)' }}>{formatDate(row.value)}</span></p>
                    <p style={{ color: 'var(--color-text-muted)' }}>
                      sum_full {dateValues.sum_full} · sum_short {dateValues.sum_short} · mmdd {dateValues.concat_mmdd}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Most connected entities */}
          {topEntities.length > 0 && (
            <div className="card p-4">
              <h3 className="section-title mb-3">Most connected to</h3>
              <div className="space-y-2">
                {topEntities.map(({ entity: e, count }) => (
                  <Link
                    key={e.other_entity_id}
                    href={`/entity/${e.other_entity_slug}`}
                    className="flex items-center justify-between py-1.5 hover:opacity-80 transition-opacity"
                  >
                    <span className="text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>
                      {e.other_entity_name}
                    </span>
                    <span
                      className="text-xs flex-shrink-0 px-1.5 py-0.5 rounded-full ml-2"
                      style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text-muted)' }}
                    >
                      {count}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {entity.type === 'person' && sharedEventPeople.length > 0 && (
            <div className="card p-4">
              <h3 className="section-title mb-3">People via shared events</h3>
              <div className="space-y-2">
                {sharedEventPeople.map(({ entity: e, count }) => (
                  <Link key={e.other_entity_id} href={`/entity/${e.other_entity_slug}`} className="flex items-center justify-between py-1.5 hover:opacity-80 transition-opacity">
                    <span className="text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>{e.other_entity_name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full ml-2" style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text-muted)' }}>
                      {count}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {entity.type === 'person' && sharedEventOrgs.length > 0 && (
            <div className="card p-4">
              <h3 className="section-title mb-3">Organizations via shared events</h3>
              <div className="space-y-2">
                {sharedEventOrgs.map(({ entity: e, count }) => (
                  <Link key={e.other_entity_id} href={`/entity/${e.other_entity_slug}`} className="flex items-center justify-between py-1.5 hover:opacity-80 transition-opacity">
                    <span className="text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>{e.other_entity_name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full ml-2" style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text-muted)' }}>
                      {count}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {entity.type === 'person' && sharedOrgPeople.length > 0 && (
            <div className="card p-4">
              <h3 className="section-title mb-3">People via shared organizations</h3>
              <div className="space-y-2">
                {sharedOrgPeople.map(({ entity: e, count }) => (
                  <Link key={e.other_entity_id} href={`/entity/${e.other_entity_slug}`} className="flex items-center justify-between py-1.5 hover:opacity-80 transition-opacity">
                    <span className="text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>{e.other_entity_name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full ml-2" style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text-muted)' }}>
                      {count}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {entity.type === 'person' && sharedOrgEvents.length > 0 && (
            <div className="card p-4">
              <h3 className="section-title mb-3">Events via shared organizations</h3>
              <div className="space-y-2">
                {sharedOrgEvents.map(({ entity: e, count }) => (
                  <Link key={e.other_entity_id} href={`/entity/${e.other_entity_slug}`} className="flex items-center justify-between py-1.5 hover:opacity-80 transition-opacity">
                    <span className="text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>{e.other_entity_name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full ml-2" style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text-muted)' }}>
                      {count}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {entity.type === 'person' && inferredPeopleCombined.length > 0 && (
            <div className="card p-4">
              <h3 className="section-title mb-3">Higher-order inferred people</h3>
              <div className="space-y-2">
                {inferredPeopleCombined.map(({ entity: e, count }) => (
                  <Link key={e.other_entity_id} href={`/entity/${e.other_entity_slug}`} className="flex items-center justify-between py-1.5 hover:opacity-80 transition-opacity">
                    <span className="text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>{e.other_entity_name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full ml-2" style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text-muted)' }}>
                      {count}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {entity.type === 'person' && inferredPeopleThreeHop.length > 0 && (
            <div className="card p-4">
              <h3 className="section-title mb-3">Three-hop inferred people</h3>
              <div className="space-y-2">
                {inferredPeopleThreeHop.map(({ entity: e, count }) => (
                  <Link key={e.other_entity_id} href={`/entity/${e.other_entity_slug}`} className="flex items-center justify-between py-1.5 hover:opacity-80 transition-opacity">
                    <span className="text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>{e.other_entity_name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full ml-2" style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text-muted)' }}>
                      {count}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {showNumerology && similarNumericEntities.length > 0 && (
            <div className="card p-4">
              <h3 className="section-title mb-3">Similar numeric values</h3>
              <div className="space-y-2">
                {similarNumericEntities.map((candidate) => (
                  <EntityCard key={candidate.id} entity={candidate} compact />
                ))}
              </div>
            </div>
          )}

          {/* Path finder shortcut */}
          <div className="card p-4">
            <h3 className="section-title mb-3">Find connections</h3>
            <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
              Discover how {entity.name} is connected to someone else.
            </p>
            <Link
              href={`/paths?from=${entity.id}`}
              className="btn-outline w-full justify-center text-sm"
            >
              <GitBranch size={14} />
              Find paths from {entity.name.split(' ')[0]}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const entity = await getEntity(slug);
  if (!entity) return { title: 'Not found' };
  return {
    title: entity.name,
    description: entity.description ?? `Connections and relationships for ${entity.name}`,
  };
}
