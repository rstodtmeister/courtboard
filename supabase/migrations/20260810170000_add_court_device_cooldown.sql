alter table public.games
  add column if not exists score_blocked_device text,
  add column if not exists score_blocked_until timestamptz;

create index if not exists games_score_block_idx
  on public.games(score_blocked_device, score_blocked_until)
  where score_blocked_device is not null;

create or replace function public.acquire_score_game_lock(
  p_game_id uuid,
  p_tournament_id uuid,
  p_device_id text,
  p_stale_after interval default interval '30 minutes'
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  locked_game public.games%rowtype;
begin
  if p_game_id is null or p_tournament_id is null then
    raise exception 'score_game_not_found';
  end if;
  if nullif(btrim(p_device_id), '') is null or length(p_device_id) > 160 then
    raise exception 'score_device_required';
  end if;
  if p_stale_after is null or p_stale_after < interval '1 minute' then
    raise exception 'invalid_lock_timeout';
  end if;

  select * into locked_game
  from public.games
  where id = p_game_id and tournament_id = p_tournament_id
  for update;

  if not found then
    raise exception 'score_game_not_found';
  end if;
  if locked_game.completed then
    return to_jsonb(locked_game);
  end if;
  if locked_game.score_blocked_device = p_device_id
    and locked_game.score_blocked_until is not null
    and locked_game.score_blocked_until > statement_timestamp() then
    raise exception 'score_device_cooldown';
  end if;
  if locked_game.score_locked_by_device is not null
    and locked_game.score_locked_by_device <> p_device_id
    and locked_game.score_locked_at is not null
    and locked_game.score_locked_at >= statement_timestamp() - p_stale_after then
    raise exception 'score_lock_conflict';
  end if;

  update public.games
  set score_locked_by_device = p_device_id,
      score_locked_at = statement_timestamp(),
      score_blocked_device = null,
      score_blocked_until = null
  where id = locked_game.id
  returning * into locked_game;

  return to_jsonb(locked_game);
end;
$$;

create or replace function public.save_score_game(
  p_game_id uuid,
  p_tournament_id uuid,
  p_link_game_id uuid,
  p_link_court text,
  p_device_id text,
  p_score jsonb,
  p_stale_after interval default interval '30 minutes'
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  locked_game public.games%rowtype;
  saved_game public.games%rowtype;
  next_game_id uuid;
  is_completed boolean;
begin
  if p_game_id is null or p_tournament_id is null then
    raise exception 'score_game_not_allowed';
  end if;
  if nullif(btrim(p_device_id), '') is null or length(p_device_id) > 160 then
    raise exception 'score_device_required';
  end if;
  if jsonb_typeof(p_score) is distinct from 'object' then
    raise exception 'invalid_score_payload';
  end if;
  if p_stale_after is null or p_stale_after < interval '1 minute' then
    raise exception 'invalid_lock_timeout';
  end if;

  select * into locked_game
  from public.games
  where id = p_game_id and tournament_id = p_tournament_id
  for update;

  if not found
    or (p_link_game_id is not null and locked_game.id <> p_link_game_id)
    or (p_link_court is not null and locked_game.court is distinct from p_link_court) then
    raise exception 'score_game_not_allowed';
  end if;
  if locked_game.completed then
    raise exception 'score_game_completed';
  end if;
  if locked_game.score_locked_by_device is not null
    and locked_game.score_locked_by_device <> p_device_id
    and locked_game.score_locked_at is not null
    and locked_game.score_locked_at >= statement_timestamp() - p_stale_after then
    raise exception 'score_lock_conflict';
  end if;

  is_completed := coalesce((p_score ->> 'completed')::boolean, false);
  update public.games
  set
    score_locked_by_device = case when is_completed then null else p_device_id end,
    score_locked_at = case when is_completed then null else statement_timestamp() end,
    referee = coalesce(p_score ->> 'referee', ''),
    result = coalesce(p_score ->> 'result', ''),
    winner_team = coalesce(p_score ->> 'winnerTeam', ''),
    game_rating = coalesce(p_score ->> 'gameRating', ''),
    set1_team_a = coalesce(p_score ->> 'set1TeamA', ''),
    set1_team_b = coalesce(p_score ->> 'set1TeamB', ''),
    set2_team_a = coalesce(p_score ->> 'set2TeamA', ''),
    set2_team_b = coalesce(p_score ->> 'set2TeamB', ''),
    set3_team_a = coalesce(p_score ->> 'set3TeamA', ''),
    set3_team_b = coalesce(p_score ->> 'set3TeamB', ''),
    completed = is_completed,
    point_history = nullif(p_score ->> 'pointHistory', ''),
    dirty = true
  where id = locked_game.id
  returning * into saved_game;

  if is_completed and p_link_game_id is null and p_link_court is not null then
    select id into next_game_id
    from public.games
    where tournament_id = p_tournament_id
      and court = p_link_court
      and not completed
      and id <> p_game_id
    order by display_order nulls last,
      coalesce((regexp_match(number, '\d+'))[1]::integer, 2147483647),
      number
    limit 1
    for update;

    if next_game_id is not null then
      update public.games
      set score_blocked_device = p_device_id,
          score_blocked_until = statement_timestamp() + interval '5 minutes'
      where id = next_game_id;
    end if;
  end if;

  return to_jsonb(saved_game);
end;
$$;

revoke all on function public.acquire_score_game_lock(uuid, uuid, text, interval) from public, anon, authenticated;
grant execute on function public.acquire_score_game_lock(uuid, uuid, text, interval) to service_role;

revoke all on function public.save_score_game(uuid, uuid, uuid, text, text, jsonb, interval) from public, anon, authenticated;
grant execute on function public.save_score_game(uuid, uuid, uuid, text, text, jsonb, interval) to service_role;
