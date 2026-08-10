create table if not exists public.score_court_locks (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  court text not null,
  active_game_id uuid references public.games(id) on delete set null,
  active_device_id text,
  locked_at timestamptz,
  blocked_device_id text,
  blocked_until timestamptz,
  primary key (tournament_id, court),
  check (btrim(court) <> '')
);

alter table public.score_court_locks enable row level security;

create policy "authorized admins can manage court locks"
on public.score_court_locks
for all
to authenticated
using (public.can_access_tournament(tournament_id))
with check (public.can_access_tournament(tournament_id));

insert into public.score_court_locks (
  tournament_id, court, active_game_id, active_device_id, locked_at
)
select distinct on (tournament_id, btrim(court))
  tournament_id, btrim(court), id, score_locked_by_device, score_locked_at
from public.games
where nullif(btrim(court), '') is not null
  and score_locked_by_device is not null
order by tournament_id, btrim(court), score_locked_at desc nulls last
on conflict (tournament_id, court) do nothing;

insert into public.score_court_locks (
  tournament_id, court, blocked_device_id, blocked_until
)
select distinct on (tournament_id, btrim(court))
  tournament_id, btrim(court), score_blocked_device, score_blocked_until
from public.games
where nullif(btrim(court), '') is not null
  and score_blocked_device is not null
  and score_blocked_until > statement_timestamp()
order by tournament_id, btrim(court), score_blocked_until desc
on conflict (tournament_id, court) do update
set blocked_device_id = excluded.blocked_device_id,
    blocked_until = excluded.blocked_until;

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
  court_lock public.score_court_locks%rowtype;
  court_key text;
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

  court_key := nullif(btrim(locked_game.court), '');
  if court_key is null then
    if locked_game.score_blocked_device = p_device_id
      and locked_game.score_blocked_until > statement_timestamp() then
      raise exception 'score_device_cooldown';
    end if;
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

    update public.score_court_locks
    set active_game_id = p_game_id,
        active_device_id = p_device_id,
        locked_at = statement_timestamp(),
        blocked_device_id = null,
        blocked_until = null
    where tournament_id = p_tournament_id and court = court_key;

    update public.games
    set score_locked_by_device = null,
        score_locked_at = null,
        score_blocked_device = null,
        score_blocked_until = null
    where tournament_id = p_tournament_id and btrim(court) = court_key and id <> p_game_id;
  end if;

  update public.games
  set score_locked_by_device = p_device_id,
      score_locked_at = statement_timestamp(),
      score_blocked_device = null,
      score_blocked_until = null
  where id = p_game_id
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

create or replace function public.unlock_score_game_lock(p_game_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_game public.games%rowtype;
  court_key text;
begin
  select * into target_game from public.games where id = p_game_id;
  if not found or not public.can_access_tournament(target_game.tournament_id) then
    raise exception 'score_game_not_allowed';
  end if;

  court_key := nullif(btrim(target_game.court), '');
  if court_key is not null then
    delete from public.score_court_locks
    where tournament_id = target_game.tournament_id and court = court_key;

    update public.games
    set score_locked_by_device = null, score_locked_at = null,
        score_blocked_device = null, score_blocked_until = null
    where tournament_id = target_game.tournament_id and btrim(court) = court_key;
  else
    update public.games
    set score_locked_by_device = null, score_locked_at = null,
        score_blocked_device = null, score_blocked_until = null
    where id = p_game_id;
  end if;
end;
$$;

create or replace function public.unlock_score_court(p_tournament_id uuid, p_court text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  court_key text := nullif(btrim(p_court), '');
begin
  if p_tournament_id is null or court_key is null
    or not public.can_access_tournament(p_tournament_id) then
    raise exception 'score_game_not_allowed';
  end if;

  delete from public.score_court_locks
  where tournament_id = p_tournament_id and court = court_key;

  update public.games
  set score_locked_by_device = null, score_locked_at = null,
      score_blocked_device = null, score_blocked_until = null
  where tournament_id = p_tournament_id and btrim(court) = court_key;
end;
$$;

revoke all on table public.score_court_locks from public, anon;
grant select, insert, update, delete on table public.score_court_locks to authenticated;

revoke all on function public.acquire_score_game_lock(uuid, uuid, text, interval) from public, anon, authenticated;
grant execute on function public.acquire_score_game_lock(uuid, uuid, text, interval) to service_role;
revoke all on function public.save_score_game(uuid, uuid, uuid, text, text, jsonb, interval) from public, anon, authenticated;
grant execute on function public.save_score_game(uuid, uuid, uuid, text, text, jsonb, interval) to service_role;
revoke all on function public.unlock_score_game_lock(uuid) from public, anon;
grant execute on function public.unlock_score_game_lock(uuid) to authenticated, service_role;
revoke all on function public.unlock_score_court(uuid, text) from public, anon;
grant execute on function public.unlock_score_court(uuid, text) to authenticated, service_role;
