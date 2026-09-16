begin;
do $$
declare t uuid:=gen_random_uuid(); g uuid:=gen_random_uuid(); op uuid:=gen_random_uuid();
 payload jsonb; ack jsonb; started timestamptz:='2026-09-16T09:10:00Z'; ended timestamptz:='2026-09-16T09:40:00Z';
begin
 insert into public.tournaments(id,name,hvv_edit_url,court_streams) values(t,'YouTube timing test','', '{"1":"https://www.youtube.com/watch?v=abcdefghijk"}');
 insert into public.games(id,tournament_id,number,court,team_a,team_b) values(g,t,'1','1','Alpha','Beta');
 insert into public.score_entry_links(tournament_id,game_id,token_hash) values(t,g,'youtube-test');
 payload:=jsonb_build_object('referee','Ref','completed',false,'matchStartedAt',started,'matchVideoId','abcdefghijk');
 ack:=public.submit_score_operation('youtube-test',g,'device',op,0,payload,'{"drop":0,"keep":0,"append":[]}');
 if (select match_started_at from public.games where id=g) is distinct from started then raise exception 'client start not preserved'; end if;
 if (select match_court from public.games where id=g)<>'1' then raise exception 'court snapshot missing'; end if;
 ack:=public.submit_score_operation('youtube-test',g,'device',op,0,payload,'{"drop":0,"keep":0,"append":[]}');
 if ack->>'replayed'<>'true' then raise exception 'retry was not idempotent'; end if;
 -- Later stream settings and a replacement client timestamp never rewrite the original mapping.
 update public.tournaments set court_streams='{"1":"https://www.youtube.com/watch?v=zyxwvutsrqp"}' where id=t;
 payload:=payload||jsonb_build_object('matchStartedAt',started+interval '5 minutes','matchVideoId','zyxwvutsrqp','matchEndedAt',ended,'completed',true,'set1TeamA','21','set1TeamB','18','set2TeamA','21','set2TeamB','19');
 ack:=public.submit_score_operation('youtube-test',g,'device',gen_random_uuid(),1,payload,'{"drop":0,"keep":0,"append":[]}');
 if (select match_started_at from public.games where id=g) is distinct from started or (select match_video_id from public.games where id=g)<>'abcdefghijk' then raise exception 'original mapping replaced'; end if;
 if (select match_ended_at from public.games where id=g) is distinct from ended then raise exception 'client end lost'; end if;
 insert into public.youtube_recordings(tournament_id,video_id,started_at,offset_seconds) values(t,'abcdefghijk',started-interval '10 minutes',20) on conflict (tournament_id,video_id) do update set started_at=excluded.started_at,offset_seconds=excluded.offset_seconds;
 if (select video_offset_seconds from public.public_games where id=g)<>20 then raise exception 'public replay metadata unavailable'; end if;
 if (select to_jsonb(v) ? 'score_entry_state' from public.public_games v where id=g) then raise exception 'private state leaked'; end if;
end;
$$;
rollback;
