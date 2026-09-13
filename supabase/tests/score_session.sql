begin;
do $$
declare t uuid:=gen_random_uuid(); g uuid:=gen_random_uuid(); op uuid:=gen_random_uuid();
 a jsonb; loaded jsonb; payload jsonb; session text; next_session text;
begin
 insert into public.tournaments(id,name,hvv_edit_url) values(t,'Device handover test','');
 insert into public.games(id,tournament_id,number,court,team_a,team_b) values(g,t,'1','1','Alpha','Beta');
 insert into public.score_entry_links(tournament_id,game_id,token_hash) values(t,g,'session-test');
 session:='{"version":1,"activeSet":1,"servingTeam":"B","leftTeam":"A","firstServerTeamA":"Anna","firstServerTeamB":"Ben"}';
 payload:=jsonb_build_object('referee','Ref','set1TeamA','8','set1TeamB','6','completed',false,'scoreEntryState',session);
 a:=public.submit_score_operation('session-test',g,'first-device',op,0,payload,'{"drop":0,"keep":0,"append":[]}');
 if a->>'revision'<>'1' or (select score_entry_state from public.games where id=g) is distinct from session then raise exception 'session not saved atomically'; end if;
 a:=public.submit_score_operation('session-test',g,'first-device',op,0,payload,'{"drop":0,"keep":0,"append":[]}');
 if a->>'replayed'<>'true' or a->>'revision'<>'1' then raise exception 'retry changed session revision'; end if;
 -- A settings-only change is a versioned operation too.
 next_session:=replace(session,'"leftTeam":"A"','"leftTeam":"B"');
 payload:=payload||jsonb_build_object('scoreEntryState',next_session);
 a:=public.submit_score_operation('session-test',g,'first-device',gen_random_uuid(),1,payload,'{"drop":0,"keep":0,"append":[]}');
 if a->>'revision'<>'2' then raise exception 'side change did not increment revision'; end if;
 perform public.submit_score_atomic('session-test',g,'first-device',null,true);
 if (select score_revision from public.games where id=g)<>2 then raise exception 'heartbeat modified session'; end if;
 begin
   perform public.acquire_score_game_lock(g,t,'second-device',interval '30 minutes');
   raise exception 'second device bypassed lock';
 exception when raise_exception then if sqlerrm<>'score_lock_conflict' then raise; end if; end;
 -- Simulate the existing lock becoming available, without changing the session.
 update public.score_court_locks set locked_at=now()-interval '31 minutes' where tournament_id=t;
 update public.games set score_locked_at=now()-interval '31 minutes' where id=g;
 loaded:=public.acquire_score_game_lock(g,t,'second-device',interval '30 minutes');
 if loaded->>'score_entry_state' is distinct from next_session or loaded->>'set1_team_a'<>'8' or loaded->>'score_revision'<>'2' then raise exception 'handover lost state'; end if;
 begin
   perform public.submit_score_operation('session-test',g,'first-device',gen_random_uuid(),2,payload,'{"drop":0,"keep":0,"append":[]}');
   raise exception 'old device could still write';
 exception when raise_exception then if sqlerrm<>'score_lock_conflict' then raise; end if; end;
 if (select to_jsonb(v) ? 'score_entry_state' from public.public_games v where id=g) then raise exception 'private state leaked to public display'; end if;
 update public.games set set1_team_a='9' where id=g;
 if (select score_entry_state from public.games where id=g) is not null then raise exception 'admin score edit left stale session'; end if;
 payload:=payload||jsonb_build_object('set1TeamA','21','set1TeamB','19','completed',true);
 a:=public.submit_score_operation('session-test',g,'second-device',gen_random_uuid(),3,payload,'{"drop":0,"keep":0,"append":[]}');
 if (select score_entry_state from public.games where id=g) is not null then raise exception 'completion retained resumable session'; end if;
end;
$$;
rollback;
