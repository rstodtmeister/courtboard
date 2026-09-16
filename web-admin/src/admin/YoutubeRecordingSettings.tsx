import React, { useEffect, useState } from 'react';
import { dataMode, getSupabase, supabaseFunctionErrorMessage } from '../dataApiCore';
import { youtubeVideoId } from '../stream';

type Recording={started_at:string|null;offset_seconds:number;manual_start:boolean};
type Response={recording:Recording|null;videoIds:string[];automaticAvailable:boolean};
function localDate(value:string|null) {
  if(!value)return '';
  const date=new Date(value);
  return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,19);
}
export function YoutubeRecordingSettings({tournamentId,url}:{tournamentId:string;url:string}) {
  const current=youtubeVideoId(url);
  const [selected,setSelected]=useState(current);
  const [ids,setIds]=useState<string[]>([]);
  const [start,setStart]=useState('');
  const [offset,setOffset]=useState('0');
  const [automatic,setAutomatic]=useState(false);
  const [manual,setManual]=useState(false);
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState('');
  useEffect(()=>setSelected(current),[current]);
  async function call(action:string,extra:object={}) {
    const {data,error}=await getSupabase().functions.invoke('youtube-recording',{body:{action,tournamentId,videoId:selected,...extra}});
    if(error)throw Error(await supabaseFunctionErrorMessage(error, 'Videoeinstellungen konnten nicht geladen werden.'));
    if(data?.error)throw Error(data.error);
    return data as Response;
  }
  function apply(data:Response) {
    setIds(data.videoIds);setAutomatic(data.automaticAvailable);setManual(Boolean(data.recording?.manual_start));
    setStart(localDate(data.recording?.started_at??null));setOffset(String(data.recording?.offset_seconds??0));
  }
  useEffect(()=>{
    if(!selected || dataMode!=='supabase')return;
    let active=true;setBusy(true);setStatus('');
    call('read').then(data=>{if(active)apply(data);}).catch(error=>{if(active)setStatus(error.message);}).finally(()=>{if(active)setBusy(false);});
    return ()=>{active=false;};
  },[selected,tournamentId]);
  async function save(action:'save'|'refresh') {
    setBusy(true);setStatus('');
    try {
      const data=await call(action,action==='save'?{startedAt:start?new Date(start).toISOString():null,offsetSeconds:Number(offset)}:{});
      apply(data);setStatus(action==='save'?'Videozeit gespeichert.':'YouTube-Streambeginn übernommen.');
    }catch(error){setStatus(error instanceof Error?error.message:'Speichern fehlgeschlagen.');}
    finally{setBusy(false);}
  }
  if(!current)return null;
  if(dataMode!=='supabase')return <p className="court-panel-help">Videozeit-Zuordnung ist im Onlinebetrieb verfügbar.</p>;
  return <details className="youtube-recording-settings"><summary>Videozeit für Spielaufzeichnungen</summary>
    <label>Aufzeichnung<select value={selected} onChange={event=>setSelected(event.target.value)} disabled={busy}>{[...new Set([current,...ids])].map(id=><option key={id} value={id}>{id}{id===current?' (aktueller Stream)':''}</option>)}</select></label>
    <label>Beginn der Aufzeichnung (Ortszeit dieses Geräts)<input type="datetime-local" step="1" value={start} onChange={event=>setStart(event.target.value)} disabled={busy}/></label>
    <label>Zeitkorrektur in Sekunden<input type="number" min="-86400" max="86400" step="1" value={offset} onChange={event=>setOffset(event.target.value)} disabled={busy}/></label>
    <p className="court-panel-help">Positiv springt später ins Video, negativ früher. Der Videolink enthält zusätzlich 15 Sekunden Vorlauf. Bei Stream-Neustart den neuen YouTube-Link speichern.</p>
    <button type="button" onClick={()=>void save('save')} disabled={busy}>Videozeit speichern</button>
    <button type="button" className="secondary" onClick={()=>void save('refresh')} disabled={busy||!automatic||manual}>Von YouTube abrufen</button>
    {manual && <p className="court-panel-help">Manueller Beginn gespeichert. Für den automatischen Abruf das Beginn-Feld leeren und speichern.</p>}
    {!automatic && <p className="court-panel-help">Automatischer Abruf noch nicht eingerichtet. Der Beginn kann manuell eingetragen werden.</p>}
    {status && <p role="status">{status}</p>}
  </details>;
}
