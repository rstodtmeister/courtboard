alter table public.tournaments
  add column if not exists court_streams jsonb not null default '{}'::jsonb;

alter table public.tournaments
  drop constraint if exists tournaments_court_streams_object_check;
alter table public.tournaments
  add constraint tournaments_court_streams_object_check
  check (jsonb_typeof(court_streams) = 'object');

drop view if exists public.public_tournaments;
create view public.public_tournaments
with (security_barrier = true)
as
select
  id,
  name,
  ''::text as hvv_edit_url,
  hvv_public_url,
  hvv_turnier_id,
  hvv_veranstaltung_id,
  hvv_type,
  hvv_gender,
  tournament_date,
  location,
  null::text as token_base_url,
  courts,
  court_streams,
  created_at
from public.tournaments;

revoke all on table public.public_tournaments from public;
grant select on table public.public_tournaments to anon, authenticated;
