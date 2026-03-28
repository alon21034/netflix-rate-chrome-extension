-- Migration: initial schema
-- Tables: title_resolution_cache, ratings_cache
-- See DESIGN.md section 4 for full data model rationale.

-- ─── title_resolution_cache ──────────────────────────────────────────────────
-- Maps a Netflix title ID to a resolved IMDb ID.
-- TTL: 30 days for confirmed matches, 12 hours for negative (no-match) entries.

create table title_resolution_cache (
  netflix_title_id  text        primary key,
  input_title       text        not null,
  canonical_title   text,
  imdb_id           text,       -- null when no match found (negative cache)
  content_type      text        check (content_type in ('movie', 'series')),
  release_year      int,
  source            text        not null check (source in ('google-primary', 'manual')),
  confidence        numeric     not null default 0.0 check (confidence >= 0.0 and confidence <= 1.0),
  last_verified_at  timestamptz not null default now(),
  expires_at        timestamptz not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_title_resolution_expires_at
  on title_resolution_cache (expires_at);

-- Auto-update updated_at on row changes.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_title_resolution_cache_updated_at
  before update on title_resolution_cache
  for each row execute function set_updated_at();

-- ─── ratings_cache ────────────────────────────────────────────────────────────
-- Caches OMDb ratings payload keyed by IMDb ID.
-- TTL: 7 days.

create table ratings_cache (
  imdb_id     text        primary key,
  imdb_rating numeric,
  rt_score    text,
  payload     jsonb       not null,
  fetched_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

create index idx_ratings_cache_expires_at
  on ratings_cache (expires_at);
