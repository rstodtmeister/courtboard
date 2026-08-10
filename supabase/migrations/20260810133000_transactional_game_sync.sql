create or replace function public.replace_tournament_games(
  p_tournament_id uuid,
  p_games jsonb,
  p_tournament_patch jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  inserted_count integer;
begin
  if p_tournament_id is null then
    raise exception 'tournament id is required';
  end if;
  if jsonb_typeof(p_games) is distinct from 'array' then
    raise exception 'games must be a JSON array';
  end if;
  if jsonb_typeof(p_tournament_patch) is distinct from 'object' then
    raise exception 'tournament patch must be a JSON object';
  end if;
  if not exists (select 1 from public.tournaments where id = p_tournament_id) then
    raise exception 'tournament not found';
  end if;

  if p_tournament_patch <> '{}'::jsonb then
    update public.tournaments
    set
      name = coalesce(nullif(p_tournament_patch ->> 'name', ''), name),
      hvv_turnier_id = case
        when p_tournament_patch ? 'hvv_turnier_id' then nullif(p_tournament_patch ->> 'hvv_turnier_id', '')
        else hvv_turnier_id
      end,
      hvv_veranstaltung_id = case
        when p_tournament_patch ? 'hvv_veranstaltung_id' then nullif(p_tournament_patch ->> 'hvv_veranstaltung_id', '')
        else hvv_veranstaltung_id
      end,
      hvv_type = case
        when p_tournament_patch ? 'hvv_type' then nullif(p_tournament_patch ->> 'hvv_type', '')
        else hvv_type
      end,
      hvv_gender = case
        when p_tournament_patch ? 'hvv_gender' then nullif(p_tournament_patch ->> 'hvv_gender', '')
        else hvv_gender
      end,
      tournament_date = case
        when p_tournament_patch ? 'tournament_date' then nullif(p_tournament_patch ->> 'tournament_date', '')
        else tournament_date
      end,
      location = case
        when p_tournament_patch ? 'location' then nullif(p_tournament_patch ->> 'location', '')
        else location
      end,
      hvv_public_url = case
        when p_tournament_patch ? 'hvv_public_url' then nullif(p_tournament_patch ->> 'hvv_public_url', '')
        else hvv_public_url
      end
    where id = p_tournament_id;
  end if;

  delete from public.score_entry_links
  where tournament_id = p_tournament_id;

  delete from public.games
  where tournament_id = p_tournament_id;

  insert into public.games (
    tournament_id,
    number,
    round,
    game_date,
    court,
    team_a,
    team_b,
    referee,
    result,
    winner_team,
    edit_url,
    edit_method,
    edit_data,
    game_rating,
    set1_team_a,
    set1_team_b,
    set2_team_a,
    set2_team_b,
    set3_team_a,
    set3_team_b,
    printed,
    dirty,
    completed
  )
  select
    p_tournament_id,
    imported.number,
    imported.round,
    imported.game_date,
    imported.court,
    imported.team_a,
    imported.team_b,
    imported.referee,
    imported.result,
    imported.winner_team,
    imported.edit_url,
    coalesce(nullif(imported.edit_method, ''), 'GET'),
    imported.edit_data,
    imported.game_rating,
    imported.set1_team_a,
    imported.set1_team_b,
    imported.set2_team_a,
    imported.set2_team_b,
    imported.set3_team_a,
    imported.set3_team_b,
    coalesce(imported.printed, false),
    coalesce(imported.dirty, false),
    coalesce(imported.completed, false)
  from jsonb_to_recordset(p_games) as imported (
    number text,
    round text,
    game_date text,
    court text,
    team_a text,
    team_b text,
    referee text,
    result text,
    winner_team text,
    edit_url text,
    edit_method text,
    edit_data text,
    game_rating text,
    set1_team_a text,
    set1_team_b text,
    set2_team_a text,
    set2_team_b text,
    set3_team_a text,
    set3_team_b text,
    printed boolean,
    dirty boolean,
    completed boolean
  );

  get diagnostics inserted_count = row_count;
  if inserted_count <> jsonb_array_length(p_games) then
    raise exception 'game import count mismatch: expected %, inserted %', jsonb_array_length(p_games), inserted_count;
  end if;
  return inserted_count;
end;
$$;

revoke all on function public.replace_tournament_games(uuid, jsonb, jsonb) from public;
revoke all on function public.replace_tournament_games(uuid, jsonb, jsonb) from anon;
revoke all on function public.replace_tournament_games(uuid, jsonb, jsonb) from authenticated;
grant execute on function public.replace_tournament_games(uuid, jsonb, jsonb) to service_role;
