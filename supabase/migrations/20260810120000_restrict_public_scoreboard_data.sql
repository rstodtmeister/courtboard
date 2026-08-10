drop policy if exists "Public tournaments are readable" on public.tournaments;
drop policy if exists "Public games are readable" on public.games;

revoke all on table public.tournaments from anon;
revoke all on table public.games from anon;

create or replace view public.public_tournaments
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
  created_at
from public.tournaments;

create or replace view public.public_games
with (security_barrier = true)
as
select
  id,
  tournament_id,
  number,
  round,
  game_date,
  court,
  display_order,
  team_a,
  team_b,
  referee,
  result,
  winner_team,
  game_rating,
  set1_team_a,
  set1_team_b,
  set2_team_a,
  set2_team_b,
  set3_team_a,
  set3_team_b,
  false as printed,
  false as dirty,
  completed,
  point_history,
  case when score_locked_by_device is null then null else 'locked' end as score_locked_by_device,
  null::timestamptz as score_locked_at
from public.games;

revoke all on table public.public_tournaments from public;
revoke all on table public.public_games from public;
grant select on table public.public_tournaments to anon, authenticated;
grant select on table public.public_games to anon, authenticated;
