begin;
do $$
declare t uuid:=gen_random_uuid(); g uuid:=gen_random_uuid(); op uuid:=gen_random_uuid(); final_op uuid:=gen_random_uuid(); a jsonb; b jsonb; payload jsonb; delta jsonb;
begin
 insert into public.tournaments(id,name,hvv_edit_url) values(t,'Reliable score SQL test','');
 insert into public.games(id,tournament_id,number,court,team_a,team_b) values(g,t,'1','1','Alpha','Beta');
 insert into public.score_entry_links(tournament_id,game_id,token_hash) values(t,g,'reliable-test');
 payload:='{"referee":"Ref","gameRating":"Normal","set1TeamA":"15","set1TeamB":"13","completed":false,"winnerTeam":"1"}';
 delta:='{"drop":0,"keep":0,"append":[{"set":1,"team":"A","scoreA":15,"scoreB":13}]}';
 a:=public.submit_score_operation('reliable-test',g,'device',op,0,payload,delta);
 b:=public.submit_score_operation('reliable-test',g,'device',op,0,payload,delta);
 if a->>'revision'<>'1' or b->>'revision'<>'1' or b->>'replayed'<>'true' then raise exception 'replay changed revision'; end if;
 if (select jsonb_array_length(point_history::jsonb) from public.games where id=g)<>1 then raise exception 'duplicate point'; end if;
 begin perform public.submit_score_operation('reliable-test',g,'device',op,0,payload||'{"set1TeamA":"16"}',delta); raise exception 'accepted changed retry'; exception when raise_exception then if sqlerrm<>'score_operation_mismatch' then raise; end if; end;
 begin perform public.submit_score_operation('reliable-test',g,'device',gen_random_uuid(),0,payload,delta); raise exception 'accepted old revision'; exception when raise_exception then if sqlerrm<>'score_revision_conflict' then raise; end if; end;
 begin perform public.submit_score_atomic('reliable-test',g,'device',payload,false); raise exception 'legacy overwrote new protocol'; exception when raise_exception then if sqlerrm<>'score_protocol_upgrade_required' then raise; end if; end;
 begin perform public.submit_score_operation('reliable-test',g,'other',gen_random_uuid(),1,payload,delta); raise exception 'accepted other device'; exception when raise_exception then if sqlerrm<>'score_lock_conflict' then raise; end if; end;
 payload:=payload||'{"completed":true}';delta:='{"drop":0,"keep":1,"append":[]}';
 a:=public.submit_score_operation('reliable-test',g,'device',final_op,1,payload,delta);
 b:=public.submit_score_operation('reliable-test',g,'device',final_op,1,payload,delta);
 if b->>'replayed'<>'true' or b->>'completed'<>'true' or (select count(*) from public.hvv_delivery_jobs where game_id=g)<>1 then raise exception 'completion replay failed'; end if;
 if (select count(*) from public.score_operation_receipts where game_id=g)<>2 then raise exception 'receipt count'; end if;
 if has_table_privilege('anon','public.score_operation_receipts','select') or has_function_privilege('authenticated','public.submit_score_operation(text,uuid,text,uuid,bigint,jsonb,jsonb)','execute') then raise exception 'browser permission'; end if;
 update public.games set referee='Admin correction' where id=g;
 if (select score_revision from public.games where id=g)<>3 then raise exception 'admin write must invalidate revision'; end if;
end;
$$;
rollback;
