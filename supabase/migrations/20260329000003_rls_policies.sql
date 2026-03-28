-- Migration: Row Level Security
-- All tables are read/written only by the Edge Function (service role).
-- No direct client access — extension talks to the Edge Function, not Supabase directly.

alter table title_resolution_cache enable row level security;
alter table ratings_cache           enable row level security;
alter table manual_overrides        enable row level security;

-- Edge Function runs with service_role key, which bypasses RLS.
-- These deny-all policies block any anon/authenticated direct access.

create policy "deny all anon" on title_resolution_cache
  for all to anon using (false);

create policy "deny all anon" on ratings_cache
  for all to anon using (false);

create policy "deny all anon" on manual_overrides
  for all to anon using (false);
