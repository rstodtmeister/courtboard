begin;
do $$
declare t uuid:=gen_random_uuid(); g uuid:=gen_random_uuid(); g2 uuid:=gen_random_uuid(); saved jsonb; payload jsonb;
begin
 insert into public.tournaments(id,name,hvv_edit_url) values(t,'SQL test','');
 insert into public.games(id,tournament_id,number,court,team_a,team_b) values(g,t,'1','1','Alpha','Beta'),(g2,t,'2','2','Gamma','Delta');
 insert into public.score_entry_links(tournament_id,game_id,token_hash) values(t,g,'sql-test-hash');
 payload:='{"referee":"Ref","gameRating":"Normal","set1TeamA":"15","set1TeamB":"13","completed":false,"winnerTeam":"1","pointHistory":"[{\"set\":1,\"team\":\"A\",\"scoreA\":15,\"scoreB\":13},{\"type\":\"timeout\",\"set\":1,\"team\":\"B\",\"scoreA\":15,\"scoreB\":13,\"startedAt\":\"2026-09-10T10:00:00Z\"}]"}'::jsonb;
 saved:=public.submit_score_atomic('sql-test-hash',g,'device1',payload,false);
 if saved->>'winner_team'<>'Alpha' then raise exception 'winner mapping failed'; end if;
 if saved->'display_state'->>'hasPoints'<>'true' or saved->'display_state'->'timeout'->>'team'<>'B' then raise exception 'compact display state failed'; end if;
 if not exists(select 1 from public.score_entry_links where token_hash='sql-test-hash' and used_at is not null) then raise exception 'link usage missing'; end if;
 begin perform public.submit_score_atomic('bad-hash',g,'device1',payload,false); raise exception 'accepted invalid token'; exception when raise_exception then if sqlerrm <> 'score_token_invalid' then raise; end if; end;
 begin perform public.submit_score_atomic('sql-test-hash',g2,'device1',payload,false); raise exception 'accepted different game'; exception when raise_exception then if sqlerrm <> 'score_game_not_allowed' then raise; end if; end;
 begin perform public.submit_score_atomic('sql-test-hash',g,'device2',payload,false); raise exception 'accepted competing device'; exception when raise_exception then if sqlerrm <> 'score_lock_conflict' then raise; end if; end;
 perform public.submit_score_atomic('sql-test-hash',g,'device1',null,true);
 if has_function_privilege('anon','public.submit_score_atomic(text,uuid,text,jsonb,boolean)','execute') or has_function_privilege('authenticated','public.submit_score_atomic(text,uuid,text,jsonb,boolean)','execute') then raise exception 'RPC accessible to browser'; end if;
 if public.score_display_state('broken')->>'hasPoints'<>'false' then raise exception 'legacy history fallback failed'; end if;
end;
$$;
rollback;
