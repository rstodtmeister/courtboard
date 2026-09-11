-- Private append-only audit trail. A game deletion retains its protocol; deleting
-- the tournament explicitly removes its protocols with the rest of the tournament.
create table public.game_protocols (
 game_id uuid primary key,
 tournament_id uuid not null references public.tournaments(id) on delete cascade,
 snapshot jsonb not null,
 started_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 event_count bigint not null default 0,
 has_live boolean not null default false,
 has_result_entry boolean not null default false,
 has_admin_changes boolean not null default false,
 baseline_has_score boolean not null default false,
 deleted boolean not null default false
);
create table public.game_protocol_events (
 id bigint generated always as identity primary key,
 game_id uuid not null references public.game_protocols(game_id) on delete cascade,
 tournament_id uuid not null references public.tournaments(id) on delete cascade,
 recorded_at timestamptz not null default clock_timestamp(),
 source text not null check(source in ('baseline','admin','referee','system')),
 actor_id uuid,
 actor_label text,
 score_link_id uuid,
 action text not null check(action in ('baseline','created','updated','deleted')),
 changes jsonb not null default '{}',
 history_change jsonb,
 snapshot jsonb
);
create index game_protocols_tournament on public.game_protocols(tournament_id,game_id);
create index game_protocol_events_game on public.game_protocol_events(game_id,id);
alter table public.game_protocols enable row level security;
alter table public.game_protocol_events enable row level security;
revoke all on public.game_protocols,public.game_protocol_events from public,anon,authenticated,service_role;
grant select on public.game_protocols,public.game_protocol_events to authenticated,service_role;
create policy "assigned admins read protocols" on public.game_protocols for select to authenticated using(public.can_access_tournament(tournament_id));
create policy "assigned admins read protocol events" on public.game_protocol_events for select to authenticated using(public.can_access_tournament(tournament_id));

create function public.game_protocol_snapshot(g public.games) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('number',g.number,'round',g.round,'game_date',g.game_date,'court',g.court,'team_a',g.team_a,'team_b',g.team_b,
 'referee',g.referee,'game_rating',g.game_rating,'set1_team_a',g.set1_team_a,'set1_team_b',g.set1_team_b,'set2_team_a',g.set2_team_a,'set2_team_b',g.set2_team_b,
 'set3_team_a',g.set3_team_a,'set3_team_b',g.set3_team_b,'result',g.result,'winner_team',g.winner_team,'completed',g.completed);
$$;
create function public.protocol_has_score(s jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce((s->>'completed')::boolean,false) or coalesce(s->>'result','')<>'' or exists(
 select 1 from jsonb_each_text(s) x where x.key like 'set%team_%' and coalesce(x.value,'') not in ('','0'));
$$;
-- Keep malformed legacy history verbatim in the baseline; do not invent points.
create function public.protocol_history(value text) returns jsonb language plpgsql immutable set search_path='' as $$
begin
 if value is null or value='' then return '[]'; end if;
 return value::jsonb;
exception when others then return jsonb_build_object('unreadableLegacyHistory',value);
end;
$$;

insert into public.game_protocols(game_id,tournament_id,snapshot,baseline_has_score,event_count)
 select id,tournament_id,public.game_protocol_snapshot(g),public.protocol_has_score(public.game_protocol_snapshot(g)),1 from public.games g;
insert into public.game_protocol_events(game_id,tournament_id,source,action,snapshot,history_change)
 select id,tournament_id,'baseline','baseline',public.game_protocol_snapshot(g),jsonb_build_object('replace',public.protocol_history(point_history)) from public.games g;

create function public.record_game_protocol() returns trigger language plpgsql security definer set search_path='' as $$
declare previous jsonb; current_snapshot jsonb; differences jsonb; history_edit jsonb; ctx jsonb;
 origin text; actor uuid; actor_name text; history_changed boolean:=false; live_change boolean:=false; result_entry boolean:=false;
 target public.games; event_action text;
begin
 if tg_op='DELETE' then target:=old; else target:=new; end if;
 -- The owning tournament's intentional cascade has already removed this archive.
 if not exists(select 1 from public.tournaments where id=target.tournament_id) then return target; end if;
 current_snapshot:=public.game_protocol_snapshot(target);
 previous:=case when tg_op='INSERT' then '{}'::jsonb else public.game_protocol_snapshot(old) end;
 select coalesce(jsonb_object_agg(n.key,jsonb_build_object('before',previous->n.key,'after',n.value)),'{}') into differences
 from jsonb_each(current_snapshot) n where previous->n.key is distinct from n.value;
 if tg_op='UPDATE' then history_changed:=old.point_history is distinct from new.point_history; end if;
 if tg_op='UPDATE' and differences='{}' and not history_changed then return new; end if;
 ctx:=coalesce(nullif(current_setting('courtboard.protocol_actor',true),'')::jsonb,'{}');
 actor:=auth.uid();
 if actor is not null and public.is_admin() then
   origin:='admin'; actor_name:=coalesce(auth.jwt()->>'email',actor::text);
 elsif ctx->>'source'='referee' then origin:='referee'; actor:=null; actor_name:='Ergebnislink';
 else origin:='system'; actor:=null; actor_name:='Import / System'; end if;
 if history_changed then
   history_edit:=nullif(current_setting('courtboard.protocol_delta',true),'')::jsonb;
   if history_edit is null then history_edit:=jsonb_build_object('replace',public.protocol_history(new.point_history)); end if;
   live_change:=origin='referee' and (public.protocol_history(new.point_history)<>'[]' or public.protocol_history(old.point_history)<>'[]');
 end if;
 result_entry:=not history_changed and exists(select 1 from jsonb_each(differences) x where x.key like 'set%team_%' and coalesce(x.value->>'after','') not in ('','0'));
 event_action:=case tg_op when 'INSERT' then 'created' when 'DELETE' then 'deleted' else 'updated' end;
 insert into public.game_protocols(game_id,tournament_id,snapshot) values(target.id,target.tournament_id,current_snapshot) on conflict(game_id) do nothing;
 insert into public.game_protocol_events(game_id,tournament_id,source,actor_id,actor_label,score_link_id,action,changes,history_change,snapshot)
 values(target.id,target.tournament_id,origin,actor,actor_name,(ctx->>'linkId')::uuid,event_action,
 case when tg_op='UPDATE' then differences else '{}' end,case when tg_op='INSERT' then jsonb_build_object('replace',public.protocol_history(target.point_history)) else history_edit end,
 case when tg_op='INSERT' then current_snapshot else null end);
 update public.game_protocols set snapshot=current_snapshot,updated_at=clock_timestamp(),event_count=event_count+1,
 has_live=has_live or live_change,
 has_result_entry=has_result_entry or (result_entry and tg_op='UPDATE'),
 has_admin_changes=has_admin_changes or (origin='admin' and tg_op<>'INSERT'),
 baseline_has_score=baseline_has_score or (tg_op='INSERT' and public.protocol_has_score(current_snapshot)),
 deleted=tg_op='DELETE' where game_id=target.id;
 return target;
end;
$$;
revoke all on function public.record_game_protocol() from public,anon,authenticated;
create trigger games_protocol after insert or update or delete on public.games for each row execute function public.record_game_protocol();

create or replace function public.submit_score_operation(p_token_hash text,p_game_id uuid,p_device_id text,p_operation_id uuid,p_revision bigint,p_score jsonb,p_history_delta jsonb)
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
 perform set_config('courtboard.protocol_delta',p_history_delta::text,true);
 saved:=public.submit_score_atomic(p_token_hash,p_game_id,p_device_id,p_score||jsonb_build_object('pointHistory',history::text),false);
 perform set_config('courtboard.protocol_delta','',true);
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


create or replace function public.submit_score_atomic(
 p_token_hash text, p_game_id uuid, p_device_id text, p_score jsonb,
 p_heartbeat boolean default false
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare link public.score_entry_links%rowtype; game public.games%rowtype; saved jsonb; score jsonb; old_actor text;
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
 old_actor:=current_setting('courtboard.protocol_actor',true);
 perform set_config('courtboard.protocol_actor',jsonb_build_object('source','referee','linkId',link.id)::text,true);
 saved := public.save_score_game(game.id,link.tournament_id,link.game_id,link.court,p_device_id,score,interval '30 minutes');
 perform set_config('courtboard.protocol_actor',coalesce(old_actor,''),true);
 update public.score_entry_links set used_at=statement_timestamp() where id=link.id;
 if coalesce((saved->>'completed')::boolean,false) then perform public.enqueue_hvv_delivery(saved); end if;
 return saved;
end;
$$;

create or replace function public.bump_score_revision() returns trigger language plpgsql set search_path='' as $$
begin
 if row(new.team_a,new.team_b,new.referee,new.game_rating,new.set1_team_a,new.set1_team_b,new.set2_team_a,new.set2_team_b,new.set3_team_a,new.set3_team_b,new.completed,new.point_history,new.court,new.result,new.winner_team)
 is distinct from row(old.team_a,old.team_b,old.referee,old.game_rating,old.set1_team_a,old.set1_team_b,old.set2_team_a,old.set2_team_b,old.set3_team_a,old.set3_team_b,old.completed,old.point_history,old.court,old.result,old.winner_team)
 then new.score_revision:=old.score_revision+1; else new.score_revision:=old.score_revision; end if;
 return new;
end;
$$;
