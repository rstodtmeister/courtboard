-- Called only by submit-score after payload validation. Token and lock checks
-- remain in the same transaction as the write, including link usage tracking.
create function public.submit_score_atomic(
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
 return saved;
end;
$$;
revoke all on function public.submit_score_atomic(text,uuid,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.submit_score_atomic(text,uuid,text,jsonb,boolean) to service_role;
