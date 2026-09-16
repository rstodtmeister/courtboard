import React,{useEffect,useRef,useState} from 'react';
import {deleteTeamPhoto,listTeamPhotos,saveTeamPhoto,tournamentTeams} from '../teamPhotos';
import type {Game,TeamPhoto} from '../types';

type Pending={seed:number;name:string;source:string;zoom:number};
export function TeamPhotosPanel({tournamentId,games}:{tournamentId:string;games:Game[]}){
 const [photos,setPhotos]=useState<TeamPhoto[]>([]),[pending,setPending]=useState<Pending|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const input=useRef<HTMLInputElement>(null), selected=useRef<{seed:number;name:string}|null>(null);
 const load=()=>listTeamPhotos(tournamentId).then(setPhotos).catch(e=>setMessage(e instanceof Error?e.message:'Fotos konnten nicht geladen werden.'));
 useEffect(()=>{void load()},[tournamentId]);
 function choose(seed:number,name:string){selected.current={seed,name};input.current?.click()}
 function filePicked(file?:File){if(!file||!selected.current)return;setPending({...selected.current,source:URL.createObjectURL(file),zoom:1});if(input.current)input.current.value=''}
 async function save(){if(!pending)return;setBusy(true);setMessage('');try{const blob=await squareWebp(pending.source,pending.zoom);await saveTeamPhoto(tournamentId,pending.seed,pending.name,blob);URL.revokeObjectURL(pending.source);setPending(null);await load();setMessage('Teamfoto gespeichert.')}catch(e){setMessage(e instanceof Error?e.message:'Foto konnte nicht gespeichert werden.')}finally{setBusy(false)}}
 async function remove(photo:TeamPhoto){setBusy(true);try{await deleteTeamPhoto(photo);await load();setMessage('Teamfoto gelöscht.')}catch(e){setMessage(e instanceof Error?e.message:'Foto konnte nicht gelöscht werden.')}finally{setBusy(false)}}
 return <section className="team-photos-panel"><header><h2>Teamfotos</h2><p>Foto aufnehmen oder aus der Mediathek wählen. Das Bild wird quadratisch zugeschnitten und komprimiert.</p></header>
  <input ref={input} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={e=>filePicked(e.target.files?.[0])}/>
  {message&&<p className="status" role="status">{message}</p>}
  <div className="team-photo-list">{tournamentTeams(games).map(team=>{const photo=photos.find(p=>p.seed_number===team.seed);return <article key={team.seed}>
   <div className="team-photo-thumb">{photo?<img src={photo.url} alt=""/>:<span>{team.seed}</span>}</div><strong>{team.name}</strong>
   <div><button type="button" onClick={()=>choose(team.seed,team.name)} disabled={busy}>📷 {photo?'Ersetzen':'Foto'}</button>{photo&&<button type="button" className="secondary" onClick={()=>void remove(photo)} disabled={busy}>Löschen</button>}</div>
  </article>})}</div>
  {pending&&<div className="photo-editor-backdrop"><section className="photo-editor" role="dialog" aria-modal="true" aria-labelledby="photo-editor-title"><h2 id="photo-editor-title">Foto für {pending.name}</h2><div className="photo-crop-preview"><img src={pending.source} alt="Vorschau" style={{transform:`scale(${pending.zoom})`}}/></div><label>Ausschnitt vergrößern<input type="range" min="1" max="2.5" step=".05" value={pending.zoom} onChange={e=>setPending({...pending,zoom:Number(e.target.value)})}/></label><div className="score-flow-actions"><button type="button" className="secondary" onClick={()=>{URL.revokeObjectURL(pending.source);setPending(null)}}>Abbrechen</button><button type="button" disabled={busy} onClick={()=>void save()}>{busy?'Speichert…':'Foto verwenden'}</button></div></section></div>}
 </section>
}

async function squareWebp(source:string,zoom:number){const image=new Image();image.src=source;await image.decode();const side=Math.min(image.naturalWidth,image.naturalHeight)/zoom;const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;canvas.getContext('2d')!.drawImage(image,(image.naturalWidth-side)/2,(image.naturalHeight-side)/2,side,side,0,0,512,512);return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Bild konnte nicht verarbeitet werden.')),'image/webp',.82));}
