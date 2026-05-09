-- ============================================================
-- ksubn — Supabase schema
-- Run this in the Supabase SQL editor for your project
-- ============================================================

-- Enable uuid extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- fast ILIKE search

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE entity_type AS ENUM ('person', 'organization', 'event');

CREATE TYPE relation_type AS ENUM (
  'same_org_event',
  'personal_family',
  'personal_friendship',
  'personal_romance',
  'ideology',
  'employment',
  'partnership',
  'education',
  'financial',
  'other'
);

CREATE TYPE queue_status AS ENUM ('pending', 'processing', 'done', 'failed');

CREATE TYPE tab_view_type AS ENUM ('graph', 'timeline', 'profile', 'connections', 'list');

-- ============================================================
-- USERS  (extends auth.users — created by Supabase trigger)
-- ============================================================

CREATE TABLE public.profiles (
  id                UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name      TEXT        UNIQUE NOT NULL,
  at_name           TEXT        UNIQUE NOT NULL,   -- e.g. "niklas#1"
  avatar_url        TEXT,
  bio               TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),

  -- Rate limiting counters, reset daily
  submissions_today   INT     DEFAULT 0,
  entities_today      INT     DEFAULT 0,
  last_reset_date     DATE    DEFAULT CURRENT_DATE,

  -- Totals
  claims_total        INT     DEFAULT 0,
  entities_total      INT     DEFAULT 0,

  -- Account state
  tier              TEXT    DEFAULT 'free',  -- 'free' | 'pro'
  is_banned         BOOLEAN DEFAULT FALSE,
  ban_reason        TEXT
);

-- Auto-create profile row when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  base_name TEXT;
  at_n      TEXT;
  suffix    INT := 1;
BEGIN
  base_name := COALESCE(
    NEW.raw_user_meta_data->>'display_name',
    split_part(NEW.email, '@', 1)
  );
  at_n := base_name || '#' || suffix;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE at_name = at_n) LOOP
    suffix := suffix + 1;
    at_n := base_name || '#' || suffix;
  END LOOP;
  INSERT INTO public.profiles (id, display_name, at_name)
  VALUES (NEW.id, base_name, at_n)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ============================================================
-- ENTITIES
-- ============================================================

CREATE TABLE public.entities (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug            TEXT        UNIQUE NOT NULL,
  type            entity_type NOT NULL,
  name            TEXT        NOT NULL,
  description     TEXT,          -- one-liner tagline
  summary         TEXT,          -- 2–4 sentence bio
  wikidata_id     TEXT,          -- Q12345
  wikipedia_url   TEXT,
  image_url       TEXT,          -- AI silhouette stored in Supabase Storage
  birth_date      DATE,          -- people
  death_date      DATE,
  founded_date    DATE,          -- orgs / events
  ended_date      DATE,
  country         TEXT,
  tags            TEXT[],
  aliases         TEXT[],
  is_public       BOOLEAN     DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  created_by      UUID        REFERENCES public.profiles(id),
  is_bulkbot      BOOLEAN     DEFAULT FALSE,

  -- Cached link counts (updated by triggers)
  direct_claim_count INT DEFAULT 0
);

CREATE INDEX entities_name_trgm ON public.entities USING GIN (name gin_trgm_ops);
CREATE INDEX entities_type ON public.entities (type);
CREATE INDEX entities_is_public ON public.entities (is_public);

-- ============================================================
-- CLAIMS  (directed edges in the knowledge graph)
-- ============================================================

CREATE TABLE public.claims (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_entity     UUID          NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  to_entity       UUID          NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  relation_type   relation_type NOT NULL,
  description     TEXT          NOT NULL,   -- human-readable claim
  source_url      TEXT          NOT NULL,
  source_domain   TEXT,
  date_start      DATE,
  date_end        DATE,
  created_at      TIMESTAMPTZ   DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   DEFAULT NOW(),
  created_by      UUID          REFERENCES public.profiles(id),
  is_bulkbot      BOOLEAN       DEFAULT FALSE,
  is_public       BOOLEAN       DEFAULT TRUE,
  is_hidden       BOOLEAN       DEFAULT FALSE,  -- hidden after moderation

  -- Community signals
  upvotes         INT DEFAULT 0,
  downvotes       INT DEFAULT 0,
  report_count    INT DEFAULT 0,

  CHECK (from_entity <> to_entity)
);

CREATE INDEX claims_from ON public.claims (from_entity);
CREATE INDEX claims_to   ON public.claims (to_entity);
CREATE INDEX claims_type ON public.claims (relation_type);

-- Trigger: keep entity.direct_claim_count in sync
CREATE OR REPLACE FUNCTION public.update_entity_claim_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.entities SET direct_claim_count = direct_claim_count + 1 WHERE id IN (NEW.from_entity, NEW.to_entity);
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.entities SET direct_claim_count = GREATEST(0, direct_claim_count - 1) WHERE id IN (OLD.from_entity, OLD.to_entity);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER claims_count_trigger
  AFTER INSERT OR DELETE ON public.claims
  FOR EACH ROW EXECUTE PROCEDURE public.update_entity_claim_count();

-- ============================================================
-- CLAIM VOTES
-- ============================================================

CREATE TABLE public.claim_votes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id   UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vote       SMALLINT NOT NULL CHECK (vote IN (-1, 1)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (claim_id, user_id)
);

-- Trigger: keep upvotes/downvotes counters on claims updated
CREATE OR REPLACE FUNCTION public.update_claim_vote_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.vote = 1  THEN UPDATE public.claims SET upvotes   = upvotes   + 1 WHERE id = NEW.claim_id; END IF;
    IF NEW.vote = -1 THEN UPDATE public.claims SET downvotes = downvotes + 1 WHERE id = NEW.claim_id; END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.vote = 1  THEN UPDATE public.claims SET upvotes   = GREATEST(0, upvotes   - 1) WHERE id = OLD.claim_id; END IF;
    IF OLD.vote = -1 THEN UPDATE public.claims SET downvotes = GREATEST(0, downvotes - 1) WHERE id = OLD.claim_id; END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Flip from old to new
    IF OLD.vote = 1  THEN UPDATE public.claims SET upvotes   = GREATEST(0, upvotes   - 1) WHERE id = NEW.claim_id; END IF;
    IF OLD.vote = -1 THEN UPDATE public.claims SET downvotes = GREATEST(0, downvotes - 1) WHERE id = NEW.claim_id; END IF;
    IF NEW.vote = 1  THEN UPDATE public.claims SET upvotes   = upvotes   + 1 WHERE id = NEW.claim_id; END IF;
    IF NEW.vote = -1 THEN UPDATE public.claims SET downvotes = downvotes + 1 WHERE id = NEW.claim_id; END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vote_count_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.claim_votes
  FOR EACH ROW EXECUTE PROCEDURE public.update_claim_vote_counts();

-- ============================================================
-- CLAIM REPORTS
-- ============================================================

CREATE TABLE public.claim_reports (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id   UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason     TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (claim_id, user_id)
);

CREATE OR REPLACE FUNCTION public.update_report_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.claims SET report_count = report_count + 1 WHERE id = NEW.claim_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.claims SET report_count = GREATEST(0, report_count - 1) WHERE id = OLD.claim_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER report_count_trigger
  AFTER INSERT OR DELETE ON public.claim_reports
  FOR EACH ROW EXECUTE PROCEDURE public.update_report_count();

-- ============================================================
-- STARS (bookmarks)
-- ============================================================

CREATE TABLE public.stars (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entity_id  UUID REFERENCES public.entities(id) ON DELETE CASCADE,
  claim_id   UUID REFERENCES public.claims(id)  ON DELETE CASCADE,
  topic_id   UUID,   -- FK added after topics table
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (
    (entity_id IS NOT NULL AND claim_id IS NULL AND topic_id IS NULL) OR
    (entity_id IS NULL AND claim_id IS NOT NULL AND topic_id IS NULL) OR
    (entity_id IS NULL AND claim_id IS NULL AND topic_id IS NOT NULL)
  ),
  UNIQUE (user_id, entity_id),
  UNIQUE (user_id, claim_id)
);

-- ============================================================
-- SITE PREFERENCES (blacklist / whitelist domains)
-- ============================================================

CREATE TABLE public.site_preferences (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  domain        TEXT NOT NULL,
  is_blacklisted BOOLEAN DEFAULT FALSE,
  is_whitelisted BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, domain)
);

-- ============================================================
-- USER PREFERENCES (block / whitelist other users)
-- ============================================================

CREATE TABLE public.user_preferences (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_blacklisted BOOLEAN DEFAULT FALSE,
  is_whitelisted BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, target_user_id),
  CHECK (user_id <> target_user_id)
);

-- ============================================================
-- TOPICS
-- ============================================================

CREATE TABLE public.topics (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  is_public   BOOLEAN DEFAULT FALSE,
  share_token TEXT UNIQUE DEFAULT uuid_generate_v4()::TEXT,
  views       INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.topic_tabs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_id    UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  view_type   tab_view_type NOT NULL,
  config      JSONB DEFAULT '{}',  -- entities, filters, hops, etc.
  position    INT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Add star FK for topics now that the table exists
ALTER TABLE public.stars ADD CONSTRAINT stars_topic_fk
  FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON DELETE CASCADE;
ALTER TABLE public.stars ADD CONSTRAINT stars_topic_unique UNIQUE (user_id, topic_id);

-- ============================================================
-- DERIVED PATHS  (pre-computed multi-hop connections)
-- ============================================================

CREATE TABLE public.derived_paths (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_entity  UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  to_entity    UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  hops         SMALLINT NOT NULL,
  -- path = [{entity_id, claim_id}, {entity_id, claim_id}, ...]
  path         JSONB NOT NULL,
  computed_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (from_entity, to_entity)  -- keep shortest path only
);

CREATE INDEX derived_paths_from ON public.derived_paths (from_entity);
CREATE INDEX derived_paths_to   ON public.derived_paths (to_entity);

-- ============================================================
-- ENTITY QUEUE  (for processing newly submitted entities)
-- ============================================================

CREATE TABLE public.entity_queue (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wikidata_id    TEXT,
  wikipedia_url  TEXT,
  name           TEXT NOT NULL,
  entity_type    entity_type,
  submitted_by   UUID REFERENCES public.profiles(id),
  status         queue_status DEFAULT 'pending',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  processed_at   TIMESTAMPTZ,
  result_entity  UUID REFERENCES public.entities(id),
  error          TEXT
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entities       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_votes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_reports  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stars          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_preferences   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_tabs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.derived_paths  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_queue   ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read all, update only own
CREATE POLICY "profiles_select_all"  ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update_own"  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Entities: public readable, authenticated can insert
CREATE POLICY "entities_select_public" ON public.entities FOR SELECT USING (is_public = true OR auth.uid() = created_by);
CREATE POLICY "entities_insert_auth"   ON public.entities FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "entities_update_own"    ON public.entities FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "entities_delete_own"    ON public.entities FOR DELETE USING (auth.uid() = created_by);

-- Claims: public readable, auth can insert, own can delete
CREATE POLICY "claims_select_public"  ON public.claims FOR SELECT USING (is_public = true AND is_hidden = false OR auth.uid() = created_by);
CREATE POLICY "claims_insert_auth"    ON public.claims FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "claims_update_own"     ON public.claims FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "claims_delete_own"     ON public.claims FOR DELETE USING (auth.uid() = created_by);

-- Votes: auth users can CRUD their own
CREATE POLICY "votes_select_all"   ON public.claim_votes FOR SELECT USING (true);
CREATE POLICY "votes_insert_own"   ON public.claim_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "votes_update_own"   ON public.claim_votes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "votes_delete_own"   ON public.claim_votes FOR DELETE USING (auth.uid() = user_id);

-- Reports
CREATE POLICY "reports_insert_auth"  ON public.claim_reports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reports_select_own"   ON public.claim_reports FOR SELECT USING (auth.uid() = user_id);

-- Stars
CREATE POLICY "stars_all_own" ON public.stars FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Site prefs
CREATE POLICY "site_prefs_own" ON public.site_preferences FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- User prefs
CREATE POLICY "user_prefs_own" ON public.user_preferences FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Topics
CREATE POLICY "topics_select" ON public.topics FOR SELECT USING (is_public = true OR auth.uid() = user_id);
CREATE POLICY "topics_insert" ON public.topics FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "topics_update" ON public.topics FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "topics_delete" ON public.topics FOR DELETE USING (auth.uid() = user_id);

-- Topic tabs
CREATE POLICY "topic_tabs_select" ON public.topic_tabs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.topics t WHERE t.id = topic_id AND (t.is_public OR auth.uid() = t.user_id))
);
CREATE POLICY "topic_tabs_mutate" ON public.topic_tabs FOR ALL USING (
  EXISTS (SELECT 1 FROM public.topics t WHERE t.id = topic_id AND auth.uid() = t.user_id)
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.topics t WHERE t.id = topic_id AND auth.uid() = t.user_id)
);

-- Derived paths: world readable
CREATE POLICY "derived_paths_select" ON public.derived_paths FOR SELECT USING (true);

-- Queue: can insert when authed
CREATE POLICY "queue_insert" ON public.entity_queue FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "queue_select_own" ON public.entity_queue FOR SELECT USING (auth.uid() = submitted_by);

-- ============================================================
-- HELPFUL VIEWS
-- ============================================================

-- Entity connections view (both directions in one query)
CREATE VIEW public.entity_connections AS
SELECT
  c.id, c.relation_type, c.description, c.source_url, c.source_domain,
  c.date_start, c.date_end, c.upvotes, c.downvotes,
  c.created_at, c.created_by, c.is_bulkbot,
  c.from_entity, e1.name AS from_name, e1.slug AS from_slug, e1.type AS from_type, e1.image_url AS from_image,
  c.to_entity,   e2.name AS to_name,   e2.slug AS to_slug,   e2.type AS to_type,   e2.image_url AS to_image
FROM public.claims c
JOIN public.entities e1 ON e1.id = c.from_entity
JOIN public.entities e2 ON e2.id = c.to_entity
WHERE c.is_public = true AND c.is_hidden = false;

-- Function: fast full-text entity search
CREATE OR REPLACE FUNCTION public.search_entities(query TEXT, limit_n INT DEFAULT 20)
RETURNS SETOF public.entities AS $$
  SELECT * FROM public.entities
  WHERE is_public = true AND name ILIKE '%' || query || '%'
  ORDER BY direct_claim_count DESC, name
  LIMIT limit_n;
$$ LANGUAGE sql STABLE;

-- Function: get connections for an entity (both directions)
CREATE OR REPLACE FUNCTION public.entity_claims(entity_uuid UUID, limit_n INT DEFAULT 50)
RETURNS TABLE (
  claim_id UUID, relation_type relation_type, description TEXT,
  source_url TEXT, source_domain TEXT, date_start DATE, date_end DATE,
  upvotes INT, downvotes INT, is_bulkbot BOOLEAN,
  other_entity_id UUID, other_entity_name TEXT, other_entity_slug TEXT,
  other_entity_type entity_type, other_entity_image TEXT,
  direction TEXT
) AS $$
  SELECT c.id, c.relation_type, c.description,
         c.source_url, c.source_domain, c.date_start, c.date_end,
         c.upvotes, c.downvotes, c.is_bulkbot,
         e.id, e.name, e.slug, e.type, e.image_url,
         'outgoing'::TEXT
  FROM public.claims c
  JOIN public.entities e ON e.id = c.to_entity
  WHERE c.from_entity = entity_uuid AND c.is_public AND NOT c.is_hidden
  UNION ALL
  SELECT c.id, c.relation_type, c.description,
         c.source_url, c.source_domain, c.date_start, c.date_end,
         c.upvotes, c.downvotes, c.is_bulkbot,
         e.id, e.name, e.slug, e.type, e.image_url,
         'incoming'::TEXT
  FROM public.claims c
  JOIN public.entities e ON e.id = c.from_entity
  WHERE c.to_entity = entity_uuid AND c.is_public AND NOT c.is_hidden
  ORDER BY upvotes DESC
  LIMIT limit_n;
$$ LANGUAGE sql STABLE;

-- ============================================================
-- MODERATION: recalculate aggregates from source-of-truth rows
-- ============================================================
-- These functions rebuild the denormalised counts on `claims` from the
-- individual vote/report rows. Call them after any bulk moderation action
-- (e.g. removing all votes/reports from a banned user).

-- Recalculate upvotes, downvotes, and report_count for ALL claims.
CREATE OR REPLACE FUNCTION public.recalculate_all_claim_counts()
RETURNS VOID AS $$
BEGIN
  UPDATE public.claims c
  SET
    upvotes      = COALESCE((SELECT COUNT(*) FROM public.claim_votes v WHERE v.claim_id = c.id AND v.vote =  1), 0),
    downvotes    = COALESCE((SELECT COUNT(*) FROM public.claim_votes v WHERE v.claim_id = c.id AND v.vote = -1), 0),
    report_count = COALESCE((SELECT COUNT(*) FROM public.claim_reports r WHERE r.claim_id = c.id), 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recalculate counts for a single claim (fast, call after targeted edits).
CREATE OR REPLACE FUNCTION public.recalculate_claim_counts(target_claim_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.claims
  SET
    upvotes      = (SELECT COUNT(*) FROM public.claim_votes WHERE claim_id = target_claim_id AND vote =  1),
    downvotes    = (SELECT COUNT(*) FROM public.claim_votes WHERE claim_id = target_claim_id AND vote = -1),
    report_count = (SELECT COUNT(*) FROM public.claim_reports WHERE claim_id = target_claim_id)
  WHERE id = target_claim_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove ALL votes and reports from a user and fix the resulting aggregates.
-- Call this when banning a bad-faith actor so their signal is fully reversed.
CREATE OR REPLACE FUNCTION public.invalidate_user_signals(target_user_id UUID)
RETURNS TABLE (claims_affected BIGINT)
AS $$
DECLARE
  affected_claims UUID[];
BEGIN
  -- Collect the claims this user touched (before deletion)
  SELECT ARRAY_AGG(DISTINCT claim_id)
  INTO affected_claims
  FROM (
    SELECT claim_id FROM public.claim_votes  WHERE user_id = target_user_id
    UNION
    SELECT claim_id FROM public.claim_reports WHERE user_id = target_user_id
  ) sub;

  -- Delete their individual rows (triggers update counts incrementally)
  DELETE FROM public.claim_votes  WHERE user_id = target_user_id;
  DELETE FROM public.claim_reports WHERE user_id = target_user_id;

  -- Recalculate from scratch for every affected claim to fix any trigger drift
  IF affected_claims IS NOT NULL THEN
    FOR i IN 1..array_length(affected_claims, 1) LOOP
      PERFORM public.recalculate_claim_counts(affected_claims[i]);
    END LOOP;
  END IF;

  RETURN QUERY SELECT COALESCE(array_length(affected_claims, 1), 0)::BIGINT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also recalculate entity claim counts from scratch (for consistency checks)
CREATE OR REPLACE FUNCTION public.recalculate_entity_claim_counts()
RETURNS VOID AS $$
BEGIN
  UPDATE public.entities e
  SET direct_claim_count = (
    SELECT COUNT(*) FROM public.claims c
    WHERE (c.from_entity = e.id OR c.to_entity = e.id)
      AND c.is_public AND NOT c.is_hidden
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- STORAGE BUCKET for entity images
-- ============================================================
-- Run in Supabase dashboard: Storage > New bucket > "entity-images" (public)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('entity-images', 'entity-images', true);
