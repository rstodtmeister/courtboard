begin;
insert into auth.users(id) values('a3000000-0000-0000-0000-000000000001'),('a3000000-0000-0000-0000-000000000002');
insert into public.admin_users(user_id,role,password_setup_required) values('a3000000-0000-0000-0000-000000000001','admin',false),('a3000000-0000-0000-0000-000000000002','admin',false);
insert into public.tournaments(id,name,hvv_edit_url) values('c3000000-0000-0000-0000-000000000001','Protocol regression','');
insert into public.tournament_admins(tournament_id,user_id) values('c3000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001');
insert into public.games(id,tournament_id,number,court,team_a,team_b) values('d3000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000001','1','1','A','B');
insert into public.score_entry_links(tournament_id,game_id,token_hash) values('c3000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001','protocol-test');
do $$
declare g uuid:='d3000000-0000-0000-0000-000000000001'; payload jsonb; delta jsonb; op uuid:=gen_random_uuid(); a jsonb; n bigint;
begin
 assert (select event_count=1 from public.game_protocols where game_id=g),'creation snapshot missing';
 update public.games set dirty=true,printed=true,score_locked_at=now() where id=g;
 assert (select event_count=1 from public.game_protocols where game_id=g),'metadata must not add audit noise';
 payload:='{"referee":"Ref","gameRating":"Normal","set1TeamA":"1","set1TeamB":"0","completed":false}';
 delta:='{"drop":0,"keep":0,"append":[{"set":1,"team":"A","scoreA":1,"scoreB":0}]}';
 a:=public.submit_score_operation('protocol-test',g,'device',op,0,payload,delta);
 perform public.submit_score_operation('protocol-test',g,'device',op,0,payload,delta);
 assert (select event_count=2 and has_live and not has_result_entry from public.game_protocols where game_id=g),'live source or idempotency';
 assert (select source='referee' and score_link_id is not null and actor_id is null and history_change=delta from public.game_protocol_events where game_id=g order by id desc limit 1),'compact history or attribution';
 select event_count into n from public.game_protocols where game_id=g;
 begin perform public.submit_score_operation('protocol-test',g,'device',gen_random_uuid(),0,payload,delta); exception when raise_exception then assert sqlerrm='score_revision_conflict'; end;
 assert (select event_count=n from public.game_protocols where game_id=g),'rejected write was audited';
 -- Exercise >120 changes, including actual rolling-window truncation and undo.
 for i in 2..125 loop
   delta:=jsonb_build_object('drop',case when i>120 then 1 else 0 end,'keep',least(i-1,119),'append',jsonb_build_array(jsonb_build_object('set',1,'team','A','scoreA',i%99,'scoreB',0)));
   a:=public.submit_score_operation('protocol-test',g,'device',gen_random_uuid(),(a->>'revision')::bigint,payload||jsonb_build_object('set1TeamA',(i%99)::text),delta);
 end loop;
 assert (select count(*)=126 from public.game_protocol_events where game_id=g),'archive lost older points';
 assert (select jsonb_array_length(point_history::jsonb)=120 from public.games where id=g),'live window cap changed';
 a:=public.submit_score_operation('protocol-test',g,'device',gen_random_uuid(),(a->>'revision')::bigint,payload||'{"set1TeamA":"25"}', '{"drop":0,"keep":119,"append":[]}');
 assert (select history_change->>'keep'='119' from public.game_protocol_events where game_id=g order by id desc limit 1),'undo missing';
end $$;
-- Empty-history normalization must still classify a referee's result-only save.
do $$
declare t uuid:=gen_random_uuid(); g uuid:=gen_random_uuid();
begin
 insert into public.tournaments(id,name,hvv_edit_url) values(t,'Result-only protocol test','');
 insert into public.games(id,tournament_id,number,court,team_a,team_b) values(g,t,'1','2','A','B');
 insert into public.score_entry_links(tournament_id,game_id,token_hash) values(t,g,'protocol-result-only');
 perform public.submit_score_operation('protocol-result-only',g,'device',gen_random_uuid(),0,
 '{"referee":"Ref","gameRating":"Normal","set1TeamA":"15","set1TeamB":"13","completed":true}',
 '{"drop":0,"keep":0,"append":[]}');
 assert (select has_result_entry and not has_live and event_count=2 from public.game_protocols where game_id=g),'empty history hid result-only entry';
 delete from public.tournaments where id=t;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a3000000-0000-0000-0000-000000000001","role":"authenticated","email":"protocol-admin@example.invalid"}',true);
do $$ begin
 assert (select count(*)=1 from public.game_protocols),'assigned admin cannot read';
 update public.games set set1_team_a='21',set1_team_b='19',completed=true where id='d3000000-0000-0000-0000-000000000001';
 assert (select source='admin' and actor_label='protocol-admin@example.invalid' and changes->'set1_team_a'->>'before'='25' and changes->'set1_team_a'->>'after'='21' from public.game_protocol_events order by id desc limit 1),'admin old/new values or identity missing';
 begin update public.game_protocol_events set actor_label='forged'; raise exception 'audit mutable'; exception when insufficient_privilege then null; end;
 begin delete from public.game_protocols; raise exception 'archive deletable'; exception when insufficient_privilege then null; end;
 delete from public.games where id='d3000000-0000-0000-0000-000000000001';
 assert (select deleted from public.game_protocols),'game deletion removed its archive';
 assert (select action='deleted' from public.game_protocol_events order by id desc limit 1),'deletion event missing';
end $$;
select set_config('request.jwt.claims','{"sub":"a3000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
do $$ begin assert not exists(select 1 from public.game_protocols),'unassigned admin reads summary'; assert not exists(select 1 from public.game_protocol_events),'unassigned admin reads events'; end $$;
reset role;
set local role anon;
do $$ begin begin perform * from public.game_protocol_events; raise exception 'public audit access'; exception when insufficient_privilege then null; end; end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
delete from public.tournaments where id='c3000000-0000-0000-0000-000000000001';
do $$ begin assert not exists(select 1 from public.game_protocols where tournament_id='c3000000-0000-0000-0000-000000000001'),'tournament cascade missing'; end $$;
rollback;
