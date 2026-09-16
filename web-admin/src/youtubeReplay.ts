import type { Game } from './types';
export function youtubeReplay(game: Game) {
  if (!game.completed || !game.match_video_id || !/^[\w-]{11}$/.test(game.match_video_id) || !game.match_started_at || !game.match_ended_at || !game.video_started_at) return null;
  const start=Date.parse(game.match_started_at), end=Date.parse(game.match_ended_at), stream=Date.parse(game.video_started_at);
  const offset=game.video_offset_seconds ?? 0;
  if(![start,end,stream,offset].every(Number.isFinite) || end<start || start<stream) return null;
  const seconds=(start-stream)/1000+offset;
  if(seconds<0)return null;
  const seek=Math.max(0,Math.floor(seconds)-15);
  return {url:`https://www.youtube.com/watch?v=${game.match_video_id}&t=${seek}s`,seconds:seek};
}
