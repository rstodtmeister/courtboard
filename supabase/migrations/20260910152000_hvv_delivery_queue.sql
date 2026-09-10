create table public.hvv_delivery_jobs (
 game_id uuid primary key references public.games(id) on delete cascade,
 tournament_id uuid not null references public.tournaments(id) on delete cascade,
 fingerprint jsonb not null,
 status text not null default 'queued' check (status in ('queued','processing','retry','succeeded','failed','cancelled','not_configured')),
 phase text not null default 'score' check (phase in ('score','refresh')),
 attempts integer not null default 0,
 available_at timestamptz not null default now(),
 lease_until timestamptz,
 lease_token uuid,
 last_error text,
 updated_at timestamptz not null default now()
);
alter table public.hvv_delivery_jobs enable row level security;
revoke all on public.hvv_delivery_jobs from public,anon,authenticated;
grant all on public.hvv_delivery_jobs to service_role;
create index hvv_delivery_ready on public.hvv_delivery_jobs(available_at) where status in ('queued','retry','processing');
create function public.hvv_score_fingerprint(game jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('court',game->'court','referee',game->'referee','game_rating',game->'game_rating',
 'set1_team_a',game->'set1_team_a','set1_team_b',game->'set1_team_b',
 'set2_team_a',game->'set2_team_a','set2_team_b',game->'set2_team_b',
 'set3_team_a',game->'set3_team_a','set3_team_b',game->'set3_team_b','completed',game->'completed');
$$;
create function public.enqueue_hvv_delivery(game jsonb) returns void language sql security invoker set search_path='' as $$
 insert into public.hvv_delivery_jobs(game_id,tournament_id,fingerprint,status)
 values ((game->>'id')::uuid,(game->>'tournament_id')::uuid,public.hvv_score_fingerprint(game),
 case when nullif(game->>'edit_url','') is null then 'not_configured' else 'queued' end)
 on conflict(game_id) do update set fingerprint=excluded.fingerprint,status=excluded.status,phase='score',
 attempts=0,available_at=now(),lease_until=null,lease_token=null,last_error=null,updated_at=now();
$$;
-- Serialize claims briefly, but never hold a DB lock during external HTTP work.
-- Only one job per tournament can be in flight; expired leases are reclaimable.
create function public.claim_hvv_delivery() returns jsonb language plpgsql security invoker set search_path='' as $$
declare job public.hvv_delivery_jobs%rowtype; game public.games%rowtype;
begin
 perform pg_advisory_xact_lock(731928461);
 select j.* into job from public.hvv_delivery_jobs j
 where ((j.status in ('queued','retry') and j.available_at<=now()) or (j.status='processing' and j.lease_until<now()))
 and not exists(select 1 from public.hvv_delivery_jobs other where other.tournament_id=j.tournament_id and other.status='processing' and other.lease_until>=now())
 order by j.available_at,j.game_id limit 1 for update skip locked;
 if not found then return null; end if;
 select * into game from public.games where id=job.game_id;
 if public.hvv_score_fingerprint(to_jsonb(game))<>job.fingerprint then
   update public.hvv_delivery_jobs set status='cancelled',lease_until=null,updated_at=now() where game_id=job.game_id;
   return null;
 end if;
 if job.attempts>=8 then
   update public.hvv_delivery_jobs set status='failed',lease_until=null,updated_at=now() where game_id=job.game_id;
   return null;
 end if;
 update public.hvv_delivery_jobs set status='processing',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',updated_at=now()
 where game_id=job.game_id returning * into job;
 return jsonb_build_object('job',to_jsonb(job),'game',to_jsonb(game));
end;
$$;
create function public.advance_hvv_delivery(p_game_id uuid,p_lease uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.hvv_delivery_jobs set phase='refresh',updated_at=now()
 where game_id=p_game_id and lease_token=p_lease and status='processing' and lease_until>now();
 return found;
end;
$$;
create function public.finish_hvv_delivery(p_game_id uuid,p_lease uuid,p_error text default null) returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.hvv_delivery_jobs%rowtype; game public.games%rowtype;
begin
 -- Match the game-before-job lock order used by score submission.
 select * into game from public.games where id=p_game_id for update;
 select * into job from public.hvv_delivery_jobs where game_id=p_game_id for update;
 if not found or job.lease_token is distinct from p_lease or job.status<>'processing' or job.lease_until<=now() then return false; end if;
 if public.hvv_score_fingerprint(to_jsonb(game))<>job.fingerprint then
   update public.hvv_delivery_jobs set status='cancelled',lease_until=null,updated_at=now() where game_id=p_game_id;
 elsif p_error is null then
   update public.games set dirty=false where id=p_game_id;
   update public.hvv_delivery_jobs set status='succeeded',lease_until=null,last_error=null,updated_at=now() where game_id=p_game_id;
 else
   update public.hvv_delivery_jobs set status=case when attempts>=8 then 'failed' else 'retry' end,
   available_at=now()+make_interval(secs=>least(1800,30*power(2,attempts-1)::integer)),
   lease_until=null,last_error=left(p_error,1000),updated_at=now() where game_id=p_game_id;
 end if;
 return true;
end;
$$;
create function public.score_delivery_status(p_token_hash text,p_game_id uuid) returns text language plpgsql security invoker set search_path='' as $$
declare status text;
begin
 if not exists(select 1 from public.score_entry_links l join public.games g on g.tournament_id=l.tournament_id
 where l.token_hash=p_token_hash and g.id=p_game_id and (l.expires_at is null or l.expires_at>now())
 and (l.game_id is null or l.game_id=g.id) and (l.court is null or l.court=g.court)) then
 raise exception 'score_game_not_allowed'; end if;
 select j.status into status from public.hvv_delivery_jobs j where j.game_id=p_game_id;
 return coalesce(status,'not_configured');
end;
$$;
revoke all on function public.enqueue_hvv_delivery(jsonb),public.claim_hvv_delivery(),public.advance_hvv_delivery(uuid,uuid),public.finish_hvv_delivery(uuid,uuid,text),public.score_delivery_status(text,uuid) from public,anon,authenticated;
grant execute on function public.enqueue_hvv_delivery(jsonb),public.claim_hvv_delivery(),public.advance_hvv_delivery(uuid,uuid),public.finish_hvv_delivery(uuid,uuid,text),public.score_delivery_status(text,uuid) to service_role;

-- Completion and the durable delivery job commit together.
create or replace function public.submit_score_atomic(
 p_token_hash text, p_game_id uuid, p_device_id text, p_score jsonb,
 p_heartbeat boolean default false
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare link public.score_entry_links%rowtype; game public.games%rowtype; saved jsonb; score jsonb;
begin
 select * into link from public.score_entry_links where token_hash=p_token_hash for share;
 if not found then raise exception 'score_token_invalid'; end if;
 if link.expires_at is not null and link.expires_at <= now() then raise exception 'score_token_expired'; end if;
 select * into game from public.games where id=coalesce(p_game_id,link.game_id) for update;
 if not found or game.tournament_id<>link.tournament_id
   or (link.game_id is not null and game.id<>link.game_id)
   or (link.court is not null and game.court is distinct from link.court)
 then raise exception 'score_game_not_allowed'; end if;
 if p_heartbeat then
   perform public.heartbeat_score_court_lock(game.id,link.tournament_id,p_device_id,interval '30 minutes');
   return jsonb_build_object('ok',true);
 end if;
 -- The Edge validator computes the winner as side 1/2, never from user labels.
 score := p_score || jsonb_build_object('winnerTeam', case p_score->>'winnerTeam'
   when '1' then coalesce(nullif(game.team_a,''),'1')
   when '2' then coalesce(nullif(game.team_b,''),'2') else '' end);
 saved := public.save_score_game(game.id,link.tournament_id,link.game_id,link.court,p_device_id,score,interval '30 minutes');
 update public.score_entry_links set used_at=statement_timestamp() where id=link.id;
 if coalesce((saved->>'completed')::boolean,false) then perform public.enqueue_hvv_delivery(saved); end if;
 return saved;
end;
$$;
