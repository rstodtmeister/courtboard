import type { createAdminClient } from './supabase.ts';
export function youtubeId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./,'');
    const id = host === 'youtu.be' ? url.pathname.split('/')[1] : ['youtube.com','m.youtube.com','youtube-nocookie.com'].includes(host) ? url.searchParams.get('v') || (/^\/(live|embed)\//.test(url.pathname) ? url.pathname.split('/')[2] : '') : '';
    return /^[\w-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}
export async function refreshYoutubeRecording(client: ReturnType<typeof createAdminClient>, tournamentId: string, videoId: string, force = false) {
  const {data: existing, error} = await client.from('youtube_recordings').select('*').eq('tournament_id',tournamentId).eq('video_id',videoId).maybeSingle();
  if(error) throw Error('Videoeinstellungen konnten nicht geladen werden.');
  if(existing?.manual_start || (!force && existing?.started_at)) return existing;
  const key = Deno.env.get('YOUTUBE_API_KEY');
  if(!key) throw Error('YouTube-API-Schlüssel fehlt auf dem Server. Bitte Streambeginn manuell eintragen.');
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part','liveStreamingDetails');url.searchParams.set('id',videoId);url.searchParams.set('key',key);
  let response: Response;
  try { response = await fetch(url,{signal:AbortSignal.timeout(10000)}); }
  catch { throw Error('YouTube ist derzeit nicht erreichbar. Bitte später erneut versuchen.'); }
  if(!response.ok) throw Error('YouTube-Abfrage fehlgeschlagen. API-Freigabe und Kontingent prüfen.');
  const json = await response.json();
  const start = json.items?.[0]?.liveStreamingDetails?.actualStartTime;
  if(typeof start !== 'string' || !Number.isFinite(Date.parse(start))) throw Error('YouTube liefert noch keinen tatsächlichen Streambeginn. Nach Streamstart erneut abrufen.');
  // Only update automatic starts; a concurrent manual calibration must win.
  if(!existing) {
    const {error: insertError}=await client.from('youtube_recordings').upsert({tournament_id:tournamentId,video_id:videoId,started_at:start},{onConflict:'tournament_id,video_id',ignoreDuplicates:true});
    if(insertError) throw Error('Streambeginn konnte nicht gespeichert werden.');
  } else {
    const {error: updateError}=await client.from('youtube_recordings').update({started_at:start,updated_at:new Date().toISOString()}).eq('tournament_id',tournamentId).eq('video_id',videoId).eq('manual_start',false);
    if(updateError) throw Error('Streambeginn konnte nicht gespeichert werden.');
  }
  const {data: saved,error: savedError}=await client.from('youtube_recordings').select('*').eq('tournament_id',tournamentId).eq('video_id',videoId).single();
  if(savedError) throw Error('Streambeginn konnte nicht geladen werden.');
  return saved;
}
