export type EntityType = 'person' | 'organization' | 'event';

export type RelationType =
  | 'same_org_event'
  | 'personal_family'
  | 'personal_friendship'
  | 'personal_romance'
  | 'ideology'
  | 'employment'
  | 'partnership'
  | 'education'
  | 'financial'
  | 'other';

export type QueueStatus = 'pending' | 'processing' | 'done' | 'failed';
export type TabViewType = 'graph' | 'timeline' | 'profile' | 'connections' | 'list';

// ── Entity ──────────────────────────────────────────────────
export interface Entity {
  id: string;
  slug: string;
  type: EntityType;
  name: string;
  description: string | null;
  summary: string | null;
  wikidata_id: string | null;
  wikipedia_url: string | null;
  image_url: string | null;
  birth_date: string | null;
  death_date: string | null;
  founded_date: string | null;
  ended_date: string | null;
  country: string | null;
  tags: string[];
  aliases: string[];
  is_public: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  is_bulkbot: boolean;
  direct_claim_count: number;
}

// ── Claim ───────────────────────────────────────────────────
export interface Claim {
  id: string;
  from_entity: string;
  to_entity: string;
  relation_type: RelationType;
  description: string;
  source_url: string;
  source_domain: string | null;
  date_start: string | null;
  date_end: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  is_bulkbot: boolean;
  is_public: boolean;
  is_hidden: boolean;
  upvotes: number;
  downvotes: number;
  report_count: number;
}

// ── Claim with entity info (from entity_claims function) ────
export interface ClaimWithEntity {
  claim_id: string;
  relation_type: RelationType;
  description: string;
  source_url: string;
  source_domain: string | null;
  date_start: string | null;
  date_end: string | null;
  created_at: string;
  updated_at: string;
  upvotes: number;
  downvotes: number;
  is_bulkbot: boolean;
  created_by: string | null;
  submitter_at_name: string | null;   // joined from profiles
  other_entity_id: string;
  other_entity_name: string;
  other_entity_slug: string;
  other_entity_type: EntityType;
  other_entity_image: string | null;
  direction: 'incoming' | 'outgoing';
}

// ── Profile ─────────────────────────────────────────────────
export interface Profile {
  id: string;
  display_name: string;
  at_name: string;
  avatar_url: string | null;
  bio: string | null;
  onboarding_completed: boolean;
  show_numerology: boolean;
  created_at: string;
  submissions_today: number;
  entities_today: number;
  last_reset_date: string;
  claims_total: number;
  entities_total: number;
  tier: string;
  is_banned: boolean;
}

// ── Topic ───────────────────────────────────────────────────
export interface Topic {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  is_public: boolean;
  share_token: string;
  views: number;
  created_at: string;
  updated_at: string;
  profile?: Pick<Profile, 'display_name' | 'at_name' | 'avatar_url'>;
}

export interface TopicTab {
  id: string;
  topic_id: string;
  title: string;
  view_type: TabViewType;
  config: TabConfig;
  position: number;
}

export interface TabConfig {
  entity_ids?: string[];
  filter_types?: RelationType[];
  hops?: number;
  from_entity?: string;
  to_entity?: string;
}

// ── Derived path ─────────────────────────────────────────────
export interface PathStep {
  entity_id: string;
  claim_id: string;
}

export interface DerivedPath {
  id: string;
  from_entity: string;
  to_entity: string;
  hops: number;
  path: PathStep[];
  computed_at: string;
}

// ── Star ────────────────────────────────────────────────────
export interface Star {
  id: string;
  user_id: string;
  entity_id: string | null;
  claim_id: string | null;
  topic_id: string | null;
  created_at: string;
}

// ── Relation meta ────────────────────────────────────────────
export const RELATION_META: Record<RelationType, { label: string; color: string; icon: string }> = {
  same_org_event:      { label: 'Same Org / Event',   color: '#6366f1', icon: '🏛️' },
  personal_family:     { label: 'Family',              color: '#ec4899', icon: '👨‍👩‍👧' },
  personal_friendship: { label: 'Friendship',          color: '#ec4899', icon: '🤝' },
  personal_romance:    { label: 'Romance',             color: '#ec4899', icon: '❤️' },
  ideology:            { label: 'Ideology / Religion', color: '#f59e0b', icon: '✊' },
  employment:          { label: 'Employment',          color: '#22c55e', icon: '💼' },
  partnership:         { label: 'Partnership',         color: '#22c55e', icon: '🤝' },
  education:           { label: 'School / Club',       color: '#06b6d4', icon: '🎓' },
  financial:           { label: 'Financial',           color: '#a855f7', icon: '💰' },
  other:               { label: 'Other',               color: '#9090b8', icon: '🔗' },
};

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  person: 'Person',
  organization: 'Organization',
  event: 'Event',
};
