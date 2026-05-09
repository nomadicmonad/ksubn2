import Link from 'next/link';
import Image from 'next/image';
import { Users, Building2, Calendar, Link2 } from 'lucide-react';
import type { Entity, EntityType } from '@/types';

const TYPE_ICON: Record<EntityType, React.ComponentType<{ size: number; style?: React.CSSProperties }>> = {
  person:       Users,
  organization: Building2,
  event:        Calendar,
};

const TYPE_COLOR: Record<EntityType, string> = {
  person:       'var(--color-accent)',
  organization: 'var(--color-kpurple)',
  event:        'var(--color-warning)',
};

interface EntityCardProps {
  entity: Entity;
  compact?: boolean;
}

export function EntityCard({ entity, compact }: EntityCardProps) {
  const Icon = TYPE_ICON[entity.type];
  const color = TYPE_COLOR[entity.type];

  return (
    <Link
      href={`/entity/${entity.slug}`}
      className="card p-4 flex gap-3 group hover:border-[--border-accent] transition-all duration-200"
      style={{ '--border-accent': `${color}40` } as React.CSSProperties}
    >
      {/* Avatar */}
      <div
        className="flex-shrink-0 rounded-xl overflow-hidden flex items-center justify-center"
        style={{
          width: compact ? 40 : 52,
          height: compact ? 40 : 52,
          background: `${color}18`,
          border: `1px solid ${color}30`,
        }}
      >
        {entity.image_url ? (
          <Image
            src={entity.image_url}
            alt={entity.name}
            width={52}
            height={52}
            className="object-cover w-full h-full"
          />
        ) : (
          <Icon size={compact ? 18 : 22} style={{ color }} />
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3
            className="font-semibold text-sm leading-tight truncate group-hover:text-[var(--color-accent)] transition-colors"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {entity.name}
          </h3>
          <span
            className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full capitalize font-medium"
            style={{ background: `${color}15`, color }}
          >
            {entity.type}
          </span>
        </div>

        {entity.description && !compact && (
          <p
            className="text-xs mt-1 line-clamp-2 leading-relaxed"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {entity.description}
          </p>
        )}

        {!compact && (
          <div className="flex items-center gap-3 mt-2">
            <span
              className="flex items-center gap-1 text-xs"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <Link2 size={10} />
              {entity.direct_claim_count} connection{entity.direct_claim_count !== 1 ? 's' : ''}
            </span>
            {entity.country && (
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {entity.country}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

/** Inline entity pill for use inside claim rows etc. */
export function EntityPill({ entity }: { entity: Pick<Entity, 'name' | 'slug' | 'type' | 'image_url'> }) {
  const color = TYPE_COLOR[entity.type];
  return (
    <Link
      href={`/entity/${entity.slug}`}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium transition-colors hover:opacity-80"
      style={{ background: `${color}18`, color, border: `1px solid ${color}25` }}
    >
      {entity.name}
    </Link>
  );
}
