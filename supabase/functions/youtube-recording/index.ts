import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { createAdminClient, createUserClient } from '../_shared/supabase.ts';
import { refreshYoutubeRecording } from '../_shared/youtube.ts';
Deno.serve(async req => {
  const cors=handleCors(req);if(cors)return cors;
  if(req.method!=='POST')return jsonResponse({error:'Method not allowed'},405);
  const userClient=createUserClient(req);
  const {data:auth,error:authError}=await userClient.auth.getUser();
  if(authError||!auth.user)return jsonResponse({error:'Nicht angemeldet.'},401);
  const {data:admin}=await userClient.from('admin_users').select('role').eq('user_id',auth.user.id).eq('password_setup_required',false).maybeSingle();
  if(!admin)return jsonResponse({error:'Nicht berechtigt.'},403);
  let body;try{body=await req.json();}catch{return jsonResponse({error:'Ungültige Anfrage.'},400);}
  if(!body || typeof body.tournamentId!=='string' || !/^[0-9a-f-]{36}$/i.test(body.tournamentId) || typeof body.videoId!=='string' || !/^[\w-]{11}$/.test(body.videoId) || !['read','save','refresh'].includes(body.action))return jsonResponse({error:'Ungültige Videoeinstellungen.'},400);
  const client=createAdminClient();
  if(admin.role!=='superadmin') {
    const {data:assignment}=await client.from('tournament_admins').select('tournament_id').eq('tournament_id',body.tournamentId).eq('user_id',auth.user.id).maybeSingle();
    if(!assignment)return jsonResponse({error:'Nicht berechtigt.'},403);
  }
  try {
    if(body.action==='refresh')await refreshYoutubeRecording(client,body.tournamentId,body.videoId,true);
    if(body.action==='save') {
      const start=body.startedAt;
      if(start!==null && (typeof start!=='string'||!Number.isFinite(Date.parse(start))))throw Error('Ungültiger Streambeginn.');
      if(!Number.isInteger(body.offsetSeconds)||Math.abs(body.offsetSeconds)>86400)throw Error('Zeitkorrektur muss zwischen −86400 und 86400 Sekunden liegen.');
      const {error}=await client.from('youtube_recordings').upsert({tournament_id:body.tournamentId,video_id:body.videoId,started_at:start,offset_seconds:body.offsetSeconds,manual_start:start!==null,updated_at:new Date().toISOString()});
      if(error)throw Error('Videoeinstellungen konnten nicht gespeichert werden.');
    }
    const {data,error}=await client.from('youtube_recordings').select('*').eq('tournament_id',body.tournamentId);
    if(error)throw Error('Videoeinstellungen konnten nicht geladen werden.');
    return jsonResponse({recording:data?.find(row=>row.video_id===body.videoId)??null,videoIds:data?.map(row=>row.video_id)??[],automaticAvailable:Boolean(Deno.env.get('YOUTUBE_API_KEY'))});
  }catch(error){return jsonResponse({error:error instanceof Error?error.message:'Videoeinstellungen fehlgeschlagen.'},400);}
});
