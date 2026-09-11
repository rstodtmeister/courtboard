-- Empty and merely reformatted histories do not turn a result-only entry into live scoring.
create or replace function public.record_game_protocol() returns trigger language plpgsql security definer set search_path='' as $$
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
 if tg_op='UPDATE' then history_changed:=public.protocol_history(old.point_history) is distinct from public.protocol_history(new.point_history); end if;
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
