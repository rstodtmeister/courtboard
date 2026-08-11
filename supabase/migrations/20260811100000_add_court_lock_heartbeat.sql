create or replace function public.heartbeat_score_court_lock(
  p_game_id uuid,
  p_tournament_id uuid,
  p_device_id text,
  p_stale_after interval default interval '30 minutes'
)
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_game public.games%rowtype;
  court_lock public.score_court_locks%rowtype;
  court_key text;
  heartbeat_at timestamptz := statement_timestamp();
begin
  if p_game_id is null or p_tournament_id is null
    or nullif(btrim(p_device_id), '') is null or length(p_device_id) > 160 then
    raise exception 'score_device_required';
  end if;

  select * into target_game
  from public.games
  where id = p_game_id and tournament_id = p_tournament_id
  for update;

  if not found then raise exception 'score_game_not_found'; end if;
  if target_game.completed then raise exception 'score_game_completed'; end if;
  court_key := nullif(btrim(target_game.court), '');
  if court_key is null then raise exception 'score_game_not_allowed'; end if;

  select * into court_lock
  from public.score_court_locks
  where tournament_id = p_tournament_id and court = court_key
  for update;

  if not found
    or court_lock.active_game_id is distinct from p_game_id
    or court_lock.active_device_id is distinct from p_device_id
    or court_lock.locked_at is null
    or court_lock.locked_at < heartbeat_at - p_stale_after then
    raise exception 'score_lock_conflict';
  end if;

  update public.score_court_locks
  set locked_at = heartbeat_at
  where tournament_id = p_tournament_id and court = court_key;

  update public.games
  set score_locked_at = heartbeat_at
  where id = p_game_id;

  return heartbeat_at;
end;
$$;

revoke all on function public.heartbeat_score_court_lock(uuid, uuid, text, interval) from public, anon, authenticated;
grant execute on function public.heartbeat_score_court_lock(uuid, uuid, text, interval) to service_role;

-- Deployment-time regression test. All rows are removed before the migration commits.
do $$
declare
  test_tournament uuid := gen_random_uuid();
  game_one uuid := gen_random_uuid();
  game_two uuid := gen_random_uuid();
  conflict_seen boolean := false;
  cooldown_seen boolean := false;
begin
  insert into public.tournaments (id, name, hvv_edit_url)
  values (test_tournament, '__court_lock_test_' || test_tournament, '');
  insert into public.games (id, tournament_id, number, court, team_a, team_b)
  values
    (game_one, test_tournament, '1', '1', 'A', 'B'),
    (game_two, test_tournament, '2', '1', 'C', 'D');

  perform public.acquire_score_game_lock(game_one, test_tournament, 'device-a', interval '30 minutes');
  perform public.heartbeat_score_court_lock(game_one, test_tournament, 'device-a', interval '30 minutes');

  begin
    perform public.acquire_score_game_lock(game_one, test_tournament, 'device-b', interval '30 minutes');
  exception when others then
    conflict_seen := position('score_lock_conflict' in sqlerrm) > 0;
  end;
  if not conflict_seen then raise exception 'court lock competition test failed'; end if;

  perform public.save_score_game(
    game_one, test_tournament, null, '1', 'device-a',
    '{"completed":true}'::jsonb, interval '30 minutes'
  );
  begin
    perform public.acquire_score_game_lock(game_two, test_tournament, 'device-a', interval '30 minutes');
  exception when others then
    cooldown_seen := position('score_device_cooldown' in sqlerrm) > 0;
  end;
  if not cooldown_seen then raise exception 'court cooldown test failed'; end if;

  perform public.acquire_score_game_lock(game_two, test_tournament, 'device-b', interval '30 minutes');
  delete from public.tournaments where id = test_tournament;
end;
$$;
