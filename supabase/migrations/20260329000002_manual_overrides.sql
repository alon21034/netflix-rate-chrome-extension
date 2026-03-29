-- Migration: manual_overrides table
-- For high-traffic titles where automatic resolution produces wrong results.
-- An entry here takes precedence over the google-primary resolution path.

create table manual_overrides (
  netflix_title_id  text        primary key,
  imdb_id           text        not null,
  canonical_title   text        not null,
  content_type      text        check (content_type in ('movie', 'series')),
  release_year      int,
  note              text,       -- why this override exists
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger trg_manual_overrides_updated_at
  before update on manual_overrides
  for each row execute function set_updated_at();
