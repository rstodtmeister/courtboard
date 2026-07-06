alter table public.tournaments
add column if not exists courts text[] not null default array[]::text[];

update public.tournaments tournament
set courts = coalesce(court_values.courts, array[]::text[])
from (
  select
    tournament_id,
    array_agg(distinct court order by court) as courts
  from public.games
  where court is not null and btrim(court) <> ''
  group by tournament_id
) court_values
where tournament.id = court_values.tournament_id
  and tournament.courts = array[]::text[];
