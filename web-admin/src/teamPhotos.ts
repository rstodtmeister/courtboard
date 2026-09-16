import { dataMode, getSupabase } from './dataApiCore';
import type { Game, TeamPhoto } from './types';

export function tournamentTeams(games: Game[]) {
  const result = new Map<number,string>();
  for(const name of games.flatMap(game=>[game.team_a,game.team_b])) {
    const match=name?.trim().match(/^(.*?)\s*\((\d+)\)\s*$/);
    if(match && match[1] && !result.has(Number(match[2]))) result.set(Number(match[2]),name!.trim());
  }
  return [...result].map(([seed,name])=>({seed,name})).sort((a,b)=>a.seed-b.seed);
}
export function teamSeed(name?: string|null){const match=name?.match(/\((\d+)\)\s*$/);return match?Number(match[1]):null;}
export async function listTeamPhotos(tournamentId:string):Promise<TeamPhoto[]> {
  if(dataMode==='local') return [];
  const {data,error}=await getSupabase().from('team_photos').select('tournament_id,seed_number,team_name,storage_path,updated_at').eq('tournament_id',tournamentId);
  if(error) throw new Error(error.message);
  return (data??[]).map(photo=>({...photo,url:`${getSupabase().storage.from('team-photos').getPublicUrl(photo.storage_path).data.publicUrl}?v=${encodeURIComponent(photo.updated_at)}`}));
}
export async function saveTeamPhoto(tournamentId:string,seed:number,teamName:string,blob:Blob){
  const path=`${tournamentId}/${seed}.webp`;
  const client=getSupabase();
  const uploaded=await client.storage.from('team-photos').upload(path,blob,{contentType:'image/webp',upsert:true,cacheControl:'3600'});
  if(uploaded.error) throw new Error(uploaded.error.message);
  const {error}=await client.from('team_photos').upsert({tournament_id:tournamentId,seed_number:seed,team_name:teamName,storage_path:path,updated_at:new Date().toISOString()});
  if(error) throw new Error(error.message);
}
export async function deleteTeamPhoto(photo:TeamPhoto){
  const client=getSupabase(); const removed=await client.storage.from('team-photos').remove([photo.storage_path]);
  if(removed.error) throw new Error(removed.error.message);
  const {error}=await client.from('team_photos').delete().eq('tournament_id',photo.tournament_id).eq('seed_number',photo.seed_number);
  if(error) throw new Error(error.message);
}
