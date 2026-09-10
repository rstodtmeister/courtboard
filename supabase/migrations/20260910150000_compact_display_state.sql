-- Compute once on writes rather than parsing full histories for every viewer.
create function public.score_display_state(history text) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare entries jsonb; last_timeout jsonb; has_points boolean;
begin
  entries := coalesce(nullif(history, '')::jsonb, '[]'::jsonb);
  if jsonb_typeof(entries) <> 'array' then return '{"hasPoints":false,"timeout":null}'::jsonb; end if;
  select exists(select 1 from jsonb_array_elements(entries) e where not (e ? 'type')) into has_points;
  select jsonb_build_object('team', e->'team', 'startedAt', e->'startedAt') into last_timeout
  from jsonb_array_elements(entries) with ordinality x(e,n)
  where e->>'type' = 'timeout' order by n desc limit 1;
  return jsonb_build_object('hasPoints',has_points,'timeout',last_timeout);
exception when invalid_text_representation then
  return '{"hasPoints":false,"timeout":null}'::jsonb;
end;
$$;
alter table public.games add column display_state jsonb
  generated always as (public.score_display_state(point_history)) stored;
create or replace view public.public_games with (security_barrier = true) as
select id,tournament_id,number,round,game_date,court,display_order,team_a,team_b,
 referee,result,winner_team,game_rating,set1_team_a,set1_team_b,set2_team_a,set2_team_b,
 set3_team_a,set3_team_b,false as printed,false as dirty,completed,point_history,
 case when score_locked_by_device is null then null else 'locked' end as score_locked_by_device,
 null::timestamptz as score_locked_at,display_state
from public.games;
