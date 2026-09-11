alter table public.games add column score_revision bigint not null default 0;
alter table public.games add column score_protocol_version integer not null default 1;
create function public.bump_score_revision() returns trigger language plpgsql set search_path='' as $$
begin
 if row(new.referee,new.game_rating,new.set1_team_a,new.set1_team_b,new.set2_team_a,new.set2_team_b,new.set3_team_a,new.set3_team_b,new.completed,new.point_history,new.court,new.result,new.winner_team)
 is distinct from row(old.referee,old.game_rating,old.set1_team_a,old.set1_team_b,old.set2_team_a,old.set2_team_b,old.set3_team_a,old.set3_team_b,old.completed,old.point_history,old.court,old.result,old.winner_team)
 then new.score_revision:=old.score_revision+1; else new.score_revision:=old.score_revision; end if;
 return new;
end;
$$;
create trigger games_score_revision before update on public.games for each row execute function public.bump_score_revision();
create table public.score_operation_receipts (
 game_id uuid not null references public.games(id) on delete cascade,
 operation_id uuid not null,
 device_id text not null,
 command jsonb not null,
 acknowledgement jsonb not null,
 created_at timestamptz not null default now(),
 primary key(game_id,operation_id)
);
alter table public.score_operation_receipts enable row level security;
revoke all on public.score_operation_receipts from public,anon,authenticated;
grant all on public.score_operation_receipts to service_role;

create function public.submit_score_operation(p_token_hash text,p_game_id uuid,p_device_id text,p_operation_id uuid,p_revision bigint,p_score jsonb,p_history_delta jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare link public.score_entry_links%rowtype; game public.games%rowtype; receipt public.score_operation_receipts%rowtype;
 command jsonb; history jsonb; trimmed jsonb; saved jsonb; ack jsonb; drop_count integer; keep_count integer; old_protocol text;
begin
 select * into link from public.score_entry_links where token_hash=p_token_hash for share;
 if not found then raise exception 'score_token_invalid'; end if;
 if link.expires_at is not null and link.expires_at<=now() then raise exception 'score_token_expired'; end if;
 select * into game from public.games where id=p_game_id for update;
 if not found or game.tournament_id<>link.tournament_id or (link.game_id is not null and link.game_id<>game.id) or (link.court is not null and link.court is distinct from game.court) then raise exception 'score_game_not_allowed'; end if;
 if p_operation_id is null or p_revision is null or p_revision<0 or nullif(p_device_id,'') is null then raise exception 'score_invalid_operation'; end if;
 command:=jsonb_build_object('revision',p_revision,'score',p_score,'history',p_history_delta);
 select * into receipt from public.score_operation_receipts where game_id=p_game_id and operation_id=p_operation_id;
 if found then
   if receipt.device_id<>p_device_id or receipt.command is distinct from command then raise exception 'score_operation_mismatch'; end if;
   return receipt.acknowledgement||'{"replayed":true}'::jsonb;
 end if;
 if game.score_revision<>p_revision then raise exception 'score_revision_conflict'; end if;
 if jsonb_typeof(p_history_delta) is distinct from 'object' or jsonb_typeof(p_history_delta->'append') is distinct from 'array' then raise exception 'score_invalid_history_delta'; end if;
 drop_count:=(p_history_delta->>'drop')::integer; keep_count:=(p_history_delta->>'keep')::integer;
 history:=coalesce(nullif(game.point_history,'')::jsonb,'[]'::jsonb);
 if jsonb_typeof(history)<>'array' or drop_count is null or keep_count is null or drop_count<0 or keep_count<0 or drop_count+keep_count>jsonb_array_length(history) or keep_count+jsonb_array_length(p_history_delta->'append')>120 then raise exception 'score_invalid_history_delta'; end if;
 select coalesce(jsonb_agg(e order by n),'[]'::jsonb) into trimmed from jsonb_array_elements(history) with ordinality x(e,n) where n>drop_count and n<=drop_count+keep_count;
 history:=trimmed||(p_history_delta->'append');
 -- Payload and appended entries are validated by the Edge Function. This RPC
 -- independently verifies token, revision, idempotency, boundaries and court lock.
 old_protocol:=current_setting('courtboard.score_protocol',true);
 perform set_config('courtboard.score_protocol','2',true);
 saved:=public.submit_score_atomic(p_token_hash,p_game_id,p_device_id,p_score||jsonb_build_object('pointHistory',history::text),false);
 perform set_config('courtboard.score_protocol',coalesce(old_protocol,''),true);
 update public.games set score_protocol_version=2 where id=p_game_id;
 ack:=jsonb_build_object('ok',true,'operationId',p_operation_id,'revision',(saved->>'score_revision')::bigint,'completed',(saved->>'completed')::boolean,
 'hvvStatus',case when (saved->>'completed')::boolean then case when nullif(saved->>'edit_url','') is null then 'not_configured' else 'queued' end else null end);
 insert into public.score_operation_receipts values(p_game_id,p_operation_id,p_device_id,command,ack,now());
 return ack||'{"replayed":false}'::jsonb;
end;
$$;
revoke all on function public.submit_score_operation(text,uuid,text,uuid,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.submit_score_operation(text,uuid,text,uuid,bigint,jsonb,jsonb) to service_role;

-- Old open browser pages must reload after this game starts using receipts.
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
 if game.score_protocol_version=2 and current_setting('courtboard.score_protocol',true) is distinct from '2' then raise exception 'score_protocol_upgrade_required'; end if;
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
