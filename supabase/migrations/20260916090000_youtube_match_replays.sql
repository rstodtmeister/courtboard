-- New referee captures only; no inferred backfill of historical games.
alter table public.games
 add column match_started_at timestamptz,
 add column match_ended_at timestamptz,
 add column match_video_id text check (match_video_id is null or match_video_id ~ '^[A-Za-z0-9_-]{11}$'),
 add column match_court text,
 add constraint match_time_order check (match_ended_at is null or (match_started_at is not null and match_ended_at >= match_started_at));

create table public.youtube_recordings (
 tournament_id uuid not null references public.tournaments(id) on delete cascade,
 video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
 started_at timestamptz,
 offset_seconds integer not null default 0 check (offset_seconds between -86400 and 86400),
 manual_start boolean not null default false,
 updated_at timestamptz not null default now(),
 primary key (tournament_id, video_id)
);
alter table public.youtube_recordings enable row level security;
create policy "assigned admins can read recording settings" on public.youtube_recordings for select to authenticated using(public.can_access_tournament(tournament_id));
grant select on public.youtube_recordings to authenticated;
-- Mutations go through the authenticated Edge Function; spectators only see joined public fields.
revoke insert, update, delete on public.youtube_recordings from anon, authenticated;
create or replace function public.bump_score_revision() returns trigger language plpgsql set search_path='' as $$
begin
 if new.completed or (
   new.score_entry_state is not distinct from old.score_entry_state
   and row(new.team_a,new.team_b,new.set1_team_a,new.set1_team_b,new.set2_team_a,new.set2_team_b,new.set3_team_a,new.set3_team_b,new.point_history)
     is distinct from row(old.team_a,old.team_b,old.set1_team_a,old.set1_team_b,old.set2_team_a,old.set2_team_b,old.set3_team_a,old.set3_team_b,old.point_history)
 ) then new.score_entry_state := null; end if;
 if row(new.team_a,new.team_b,new.referee,new.game_rating,new.set1_team_a,new.set1_team_b,new.set2_team_a,new.set2_team_b,new.set3_team_a,new.set3_team_b,new.completed,new.point_history,new.court,new.result,new.winner_team,new.score_entry_state,new.match_started_at,new.match_ended_at,new.match_video_id)
 is distinct from row(old.team_a,old.team_b,old.referee,old.game_rating,old.set1_team_a,old.set1_team_b,old.set2_team_a,old.set2_team_b,old.set3_team_a,old.set3_team_b,old.completed,old.point_history,old.court,old.result,old.winner_team,old.score_entry_state,old.match_started_at,old.match_ended_at,old.match_video_id)
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
      match_started_at = coalesce(locked_game.match_started_at, nullif(p_score->>'matchStartedAt','')::timestamptz),
      match_ended_at = coalesce(nullif(p_score->>'matchEndedAt','')::timestamptz, locked_game.match_ended_at),
      match_video_id = case when locked_game.match_started_at is null and nullif(p_score->>'matchStartedAt','') is not null then nullif(p_score->>'matchVideoId','') else locked_game.match_video_id end,
      match_court = case when locked_game.match_started_at is null and nullif(p_score->>'matchStartedAt','') is not null then locked_game.court else locked_game.match_court end,
      completed = is_completed,
      point_history = nullif(p_score ->> 'pointHistory', ''),
      score_entry_state = case when is_completed then null else nullif(p_score ->> 'scoreEntryState', '') end,
      dirty = true,
      score_locked_by_device = case when is_completed then null else p_device_id end,
      score_locked_at = case when is_completed then null else statement_timestamp() end
  where id = p_game_id
  returning * into saved_game;

  if saved_game.match_video_id is not null then
    insert into public.youtube_recordings(tournament_id,video_id) values(p_tournament_id,saved_game.match_video_id) on conflict do nothing;
  end if;

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

create or replace view public.public_games with (security_barrier = true) as
select g.id,g.tournament_id,g.number,g.round,g.game_date,g.court,g.display_order,g.team_a,g.team_b,
 g.referee,g.result,g.winner_team,g.game_rating,g.set1_team_a,g.set1_team_b,g.set2_team_a,g.set2_team_b,
 g.set3_team_a,g.set3_team_b,false as printed,false as dirty,g.completed,g.point_history,
 case when g.score_locked_by_device is null then null else 'locked' end as score_locked_by_device,
 null::timestamptz as score_locked_at,g.display_state,
 g.match_started_at,g.match_ended_at,g.match_video_id,g.match_court,
 r.started_at as video_started_at,r.offset_seconds as video_offset_seconds
from public.games g left join public.youtube_recordings r on r.tournament_id=g.tournament_id and r.video_id=g.match_video_id;
