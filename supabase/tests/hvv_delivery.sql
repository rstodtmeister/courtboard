begin;
do $$
declare t uuid:=gen_random_uuid(); g uuid:=gen_random_uuid(); g2 uuid:=gen_random_uuid(); claimed jsonb; lease uuid; old_lease uuid; saved jsonb;
begin
 insert into public.tournaments(id,name,hvv_edit_url) values(t,'Queue test','');
 insert into public.games(id,tournament_id,number,court,team_a,team_b,edit_url) values(g,t,'1','1','A','B','https://example.invalid/edit'),(g2,t,'2','2','C','D','https://example.invalid/edit');
 insert into public.score_entry_links(tournament_id,game_id,token_hash) values(t,g,'queue-test-1'),(t,g2,'queue-test-2');
 saved:=public.submit_score_atomic('queue-test-1',g,'d1','{"referee":"R","gameRating":"Normal","set1TeamA":"15","set1TeamB":"13","set2TeamA":"","set2TeamB":"","set3TeamA":"","set3TeamB":"","winnerTeam":"1","completed":true}',false);
 if public.score_delivery_status('queue-test-1',g)<>'queued' then raise exception 'completion not enqueued'; end if;
 begin perform public.score_delivery_status('queue-test-1',g2); raise exception 'status leaked to wrong token'; exception when raise_exception then if sqlerrm<>'score_game_not_allowed' then raise; end if; end;
 claimed:=public.claim_hvv_delivery(); lease:=(claimed->'job'->>'lease_token')::uuid;
 if claimed->'game'->>'id'<>g::text then raise exception 'wrong job'; end if;
 perform public.submit_score_atomic('queue-test-2',g2,'d2','{"referee":"R","gameRating":"Normal","set1TeamA":"15","set1TeamB":"13","winnerTeam":"1","completed":true}',false);
 if public.claim_hvv_delivery() is not null then raise exception 'parallel jobs in same tournament'; end if;
 if public.finish_hvv_delivery(g,gen_random_uuid(),null) then raise exception 'stale lease accepted'; end if;
 perform public.advance_hvv_delivery(g,lease);
 perform public.finish_hvv_delivery(g,lease,'temporary refresh error');
 if not exists(select 1 from public.hvv_delivery_jobs where game_id=g and status='retry' and phase='refresh') then raise exception 'refresh phase not retained'; end if;
 -- Retry the refresh without repeating the score POST.
 update public.hvv_delivery_jobs set available_at=now()-interval '1 minute' where game_id=g;
 claimed:=public.claim_hvv_delivery(); lease:=(claimed->'job'->>'lease_token')::uuid;
 if claimed->'job'->>'phase'<>'refresh' then raise exception 'score would repeat after refresh failure'; end if;
 perform public.finish_hvv_delivery(g,lease,null);
 if exists(select 1 from public.games where id=g and dirty) then raise exception 'successful game not marked clean'; end if;
 if public.score_delivery_status('queue-test-1',g)<>'succeeded' then raise exception 'success status missing'; end if;
 -- Recover an abandoned worker, and fence its late acknowledgement.
 claimed:=public.claim_hvv_delivery(); old_lease:=(claimed->'job'->>'lease_token')::uuid;
 update public.hvv_delivery_jobs set lease_until=now()-interval '1 minute' where game_id=g2;
 claimed:=public.claim_hvv_delivery(); lease:=(claimed->'job'->>'lease_token')::uuid;
 if lease=old_lease then raise exception 'lease not renewed'; end if;
 if public.finish_hvv_delivery(g2,old_lease,null) then raise exception 'old worker acknowledged'; end if;
 update public.games set set1_team_a='16',dirty=true where id=g2;
 perform public.finish_hvv_delivery(g2,lease,null);
 if not exists(select 1 from public.hvv_delivery_jobs where game_id=g2 and status='cancelled') or not exists(select 1 from public.games where id=g2 and dirty) then raise exception 'newer edit overwritten/marked clean'; end if;
 if has_table_privilege('anon','public.hvv_delivery_jobs','select') or has_table_privilege('authenticated','public.hvv_delivery_jobs','select') then raise exception 'private queue exposed'; end if;
end;
$$;
rollback;
