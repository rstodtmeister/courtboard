create or replace function public.capture_current_court_stream()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  stream_url text;
begin
  if old.match_started_at is null
    and new.match_started_at is not null
    and new.match_video_id is null
    and nullif(btrim(new.court), '') is not null then
    select t.court_streams ->> new.court
      into stream_url
    from public.tournaments t
    where t.id = new.tournament_id;

    if stream_url ~* '^https?://(www\.)?youtube\.com/' then
      new.match_video_id := substring(stream_url from '[?&]v=([A-Za-z0-9_-]{11})');
      new.match_video_id := coalesce(new.match_video_id, substring(stream_url from '/(?:live|embed)/([A-Za-z0-9_-]{11})'));
    elsif stream_url ~* '^https?://(www\.)?youtu\.be/' then
      new.match_video_id := substring(stream_url from 'youtu\.be/([A-Za-z0-9_-]{11})');
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists games_capture_current_court_stream on public.games;
create trigger games_capture_current_court_stream
before update on public.games
for each row execute function public.capture_current_court_stream();

