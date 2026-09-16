import React,{useEffect,useRef,useState} from 'react';
import {deleteTeamPhoto,listTeamPhotos,saveTeamPhoto,tournamentTeams} from '../teamPhotos';
import type {Game,TeamPhoto} from '../types';

type Pending={seed:number;name:string;source:string;zoom:number;x:number;y:number};
export function TeamPhotosPanel({tournamentId,games}:{tournamentId:string;games:Game[]}){
 const [photos,setPhotos]=useState<TeamPhoto[]>([]),[pending,setPending]=useState<Pending|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const input=useRef<HTMLInputElement>(null),canvas=useRef<HTMLCanvasElement>(null),selected=useRef<{seed:number;name:string}|null>(null),drag=useRef<{clientX:number;clientY:number;x:number;y:number}|null>(null);
 const load=()=>listTeamPhotos(tournamentId).then(setPhotos).catch(e=>setMessage(e instanceof Error?e.message:'Fotos konnten nicht geladen werden.'));
 useEffect(()=>{void load()},[tournamentId]);
 useEffect(()=>{if(pending&&canvas.current)void drawCrop(canvas.current,pending)},[pending]);
 function choose(seed:number,name:string){selected.current={seed,name};input.current?.click()}
 function filePicked(file?:File){if(!file||!selected.current)return;setMessage('');setPending({...selected.current,source:URL.createObjectURL(file),zoom:1,x:0,y:0});if(input.current)input.current.value=''}
 async function save(){if(!pending)return;setBusy(true);setMessage('');try{const blob=await squareImage(pending);await saveTeamPhoto(tournamentId,pending.seed,pending.name,blob);URL.revokeObjectURL(pending.source);setPending(null);await load();setMessage('Teamfoto gespeichert.')}catch(e){setMessage(e instanceof Error?e.message:'Foto konnte nicht gespeichert werden.')}finally{setBusy(false)}}
 function pointerDown(event:React.PointerEvent<HTMLCanvasElement>){if(!pending)return;event.currentTarget.setPointerCapture(event.pointerId);drag.current={clientX:event.clientX,clientY:event.clientY,x:pending.x,y:pending.y}}
 function pointerMove(event:React.PointerEvent<HTMLCanvasElement>){if(!pending||!drag.current)return;const size=event.currentTarget.getBoundingClientRect().width;setPending({...pending,x:clamp(drag.current.x+(event.clientX-drag.current.clientX)/size*2),y:clamp(drag.current.y+(event.clientY-drag.current.clientY)/size*2)})}
 async function remove(photo:TeamPhoto){setBusy(true);try{await deleteTeamPhoto(photo);await load();setMessage('Teamfoto gelöscht.')}catch(e){setMessage(e instanceof Error?e.message:'Foto konnte nicht gelöscht werden.')}finally{setBusy(false)}}
 return <section className="team-photos-panel"><header><h2>Teamfotos</h2><p>Foto aufnehmen oder aus der Mediathek wählen. Das Bild wird quadratisch zugeschnitten und komprimiert.</p></header>
  <input ref={input} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={e=>filePicked(e.target.files?.[0])}/>
  {message&&<p className="status" role="status">{message}</p>}
  <div className="team-photo-list">{tournamentTeams(games).map(team=>{const photo=photos.find(p=>p.seed_number===team.seed);return <article key={team.seed}>
   <div className="team-photo-thumb">{photo?<img src={photo.url} alt=""/>:<span>{team.seed}</span>}</div><strong>{team.name}</strong>
   <div><button type="button" onClick={()=>choose(team.seed,team.name)} disabled={busy}>📷 {photo?'Ersetzen':'Foto'}</button>{photo&&<button type="button" className="secondary" onClick={()=>void remove(photo)} disabled={busy}>Löschen</button>}</div>
  </article>})}</div>
  {pending&&<div className="photo-editor-backdrop"><section className="photo-editor" role="dialog" aria-modal="true" aria-labelledby="photo-editor-title"><h2 id="photo-editor-title">Foto für {pending.name}</h2><p className="photo-editor-help">Bild mit dem Finger verschieben und über den Regler vergrößern.</p><canvas ref={canvas} className="photo-crop-preview" width="512" height="512" aria-label="Vorschau des Bildausschnitts" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={e=>{e.currentTarget.releasePointerCapture(e.pointerId);drag.current=null}}/><label>Ausschnitt vergrößern<input type="range" min="1" max="2.5" step=".05" value={pending.zoom} onChange={e=>setPending({...pending,zoom:Number(e.target.value)})}/></label>{message&&<p className="error-text" role="alert">{message}</p>}<div className="score-flow-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>{URL.revokeObjectURL(pending.source);setPending(null);setMessage('')}}>Abbrechen</button><button type="button" disabled={busy} onClick={()=>void save()}>{busy?'Speichert…':'Foto verwenden'}</button></div></section></div>}
 </section>
}

const clamp=(value:number)=>Math.max(-1,Math.min(1,value));
function loadImage(source:string){return new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Das Foto konnte nicht gelesen werden.'));image.src=source})}
async function drawCrop(canvas:HTMLCanvasElement,crop:Pick<Pending,'source'|'zoom'|'x'|'y'>){const image=await loadImage(crop.source);const side=Math.min(image.naturalWidth,image.naturalHeight)/crop.zoom,maxX=(image.naturalWidth-side)/2,maxY=(image.naturalHeight-side)/2,sx=(image.naturalWidth-side)/2-crop.x*maxX,sy=(image.naturalHeight-side)/2-crop.y*maxY;const context=canvas.getContext('2d');if(!context)throw new Error('Bildbearbeitung wird auf diesem Gerät nicht unterstützt.');context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(image,sx,sy,side,side,0,0,canvas.width,canvas.height)}
async function squareImage(crop:Pending){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;await drawCrop(canvas,crop);return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Das Foto konnte auf diesem Gerät nicht verarbeitet werden.')),'image/webp',.82))}
