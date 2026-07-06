alter table public.tournaments
add column if not exists courts text[] not null default array[]::text[];

update public.tournaments tournament
set courts = coalesce(court_values.courts, array[]::text[])
from (
  select
    tournament_id,
    array_agg(court order by court) as courts
  from (
    select distinct
      tournament_id,
      btrim(court) as court
    from public.games
    where court is not null and btrim(court) <> ''
  ) game_courts
  group by tournament_id
) court_values
where tournament.id = court_values.tournament_id
  and tournament.courts = array[]::text[];
