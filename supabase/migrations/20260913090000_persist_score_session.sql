-- Private referee state: intentionally excluded from the public display views.
alter table public.games add column score_entry_state text
  check (score_entry_state is null or length(score_entry_state) <= 200000);

create or replace function public.bump_score_revision() returns trigger language plpgsql set search_path='' as $$
begin
 if new.completed or (
   new.score_entry_state is not distinct from old.score_entry_state
   and row(new.team_a,new.team_b,new.set1_team_a,new.set1_team_b,new.set2_team_a,new.set2_team_b,new.set3_team_a,new.set3_team_b,new.point_history)
     is distinct from row(old.team_a,old.team_b,old.set1_team_a,old.set1_team_b,old.set2_team_a,old.set2_team_b,old.set3_team_a,old.set3_team_b,old.point_history)
 ) then new.score_entry_state := null; end if;
 if row(new.team_a,new.team_b,new.referee,new.game_rating,new.set1_team_a,new.set1_team_b,new.set2_team_a,new.set2_team_b,new.set3_team_a,new.set3_team_b,new.completed,new.point_history,new.court,new.result,new.winner_team,new.score_entry_state)
 is distinct from row(old.team_a,old.team_b,old.referee,old.game_rating,old.set1_team_a,old.set1_team_b,old.set2_team_a,old.set2_team_b,old.set3_team_a,old.set3_team_b,old.completed,old.point_history,old.court,old.result,old.winner_team,old.score_entry_state)
 then new.score_revision:=old.score_revision+1; else new.score_revision:=old.score_revision; end if;
 return new;
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
  court_lock public.score_court_locks%rowtype;
  next_game_id uuid;
  court_key text;
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

  court_key := nullif(btrim(locked_game.court), '');
  if court_key is null then
    if locked_game.score_locked_by_device is not null
      and locked_game.score_locked_by_device <> p_device_id
      and locked_game.score_locked_at >= statement_timestamp() - p_stale_after then
      raise exception 'score_lock_conflict';
    end if;
  else
    insert into public.score_court_locks (tournament_id, court)
    values (p_tournament_id, court_key)
    on conflict do nothing;

    select * into court_lock
    from public.score_court_locks
    where tournament_id = p_tournament_id and court = court_key
    for update;

    if court_lock.blocked_device_id = p_device_id
      and court_lock.blocked_until > statement_timestamp() then
      raise exception 'score_device_cooldown';
    end if;
    if court_lock.active_device_id is not null
      and court_lock.locked_at >= statement_timestamp() - p_stale_after
      and (court_lock.active_device_id <> p_device_id or court_lock.active_game_id is distinct from p_game_id) then
      raise exception 'score_lock_conflict';
    end if;
  end if;

  is_completed := coalesce((p_score ->> 'completed')::boolean, false);
  update public.games
  set referee = coalesce(p_score ->> 'referee', ''),
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
      score_entry_state = case when is_completed then null else nullif(p_score ->> 'scoreEntryState', '') end,
      dirty = true,
      score_locked_by_device = case when is_completed then null else p_device_id end,
      score_locked_at = case when is_completed then null else statement_timestamp() end
  where id = p_game_id
  returning * into saved_game;

  if court_key is not null then
    if is_completed then
      update public.games
      set score_locked_by_device = null,
          score_locked_at = null,
          score_blocked_device = null,
          score_blocked_until = null
      where tournament_id = p_tournament_id and btrim(court) = court_key;

      select id into next_game_id
      from public.games
      where tournament_id = p_tournament_id
        and btrim(court) = court_key
        and not completed
        and id <> p_game_id
      order by display_order nulls last,
        coalesce((regexp_match(number, '\d+'))[1]::integer, 2147483647), number
      limit 1
      for update;

      update public.score_court_locks
      set active_game_id = null,
          active_device_id = null,
          locked_at = null,
          blocked_device_id = p_device_id,
          blocked_until = statement_timestamp() + interval '5 minutes'
      where tournament_id = p_tournament_id and court = court_key;

      if next_game_id is not null then
        update public.games
        set score_blocked_device = p_device_id,
            score_blocked_until = statement_timestamp() + interval '5 minutes'
        where id = next_game_id;
      end if;
    else
      update public.score_court_locks
      set active_game_id = p_game_id,
          active_device_id = p_device_id,
          locked_at = statement_timestamp(),
          blocked_device_id = null,
          blocked_until = null
      where tournament_id = p_tournament_id and court = court_key;
    end if;
  end if;

  return to_jsonb(saved_game);
end;
$$;
