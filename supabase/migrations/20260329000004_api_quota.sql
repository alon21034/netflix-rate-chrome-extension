-- Migration: api_quota table
-- Tracks daily API call counts per provider for quota enforcement.
-- One row per (provider, date). Atomically incremented via RPC.

create table api_quota (
  provider  text  not null check (provider in ('google', 'omdb')),
  date      date  not null default current_date,
  calls     int   not null default 0 check (calls >= 0),
  primary key (provider, date)
);

-- Atomic upsert called by the Edge Function before each provider call.
create or replace function increment_quota(p_provider text)
returns int language plpgsql as $$
declare
  v_calls int;
begin
  insert into api_quota (provider, date, calls)
  values (p_provider, current_date, 1)
  on conflict (provider, date) do update
    set calls = api_quota.calls + 1
  returning calls into v_calls;
  return v_calls;
end;
$$;
