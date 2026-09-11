import { ProtocolEventItem } from './ProtocolEventItem';
import React, { useEffect, useRef, useState } from 'react';
import { dataMode } from '../dataApiCore';
import { downloadProtocolJson, exportGameProtocols, listGameProtocols, loadProtocolEvents } from '../dataApiProtocols';
import { protocolKind, protocolScoreLines, protocolValue, type GameProtocol, type ProtocolEvent } from '../gameProtocols';
import type { Tournament } from '../types';

export function GameProtocolsPage({ tournament }: { tournament: Tournament | null }) {
  const [protocols,setProtocols]=useState<GameProtocol[]>([]);
  const [selected,setSelected]=useState('');const [court,setCourt]=useState('');const [kind,setKind]=useState('');
  const [loading,setLoading]=useState(false);const [error,setError]=useState('');const [downloading,setDownloading]=useState(false);
  const request=useRef(0);
  async function refresh() {
    if(!tournament || dataMode!=='supabase')return;
    const id=++request.current;setLoading(true);setError('');
    try{const rows=await listGameProtocols(tournament.id);if(id===request.current)setProtocols(rows)}
    catch(e){if(id===request.current)setError(e instanceof Error?e.message:'Protokolle konnten nicht geladen werden.')}
    finally{if(id===request.current)setLoading(false)}
  }
  useEffect(()=>{void refresh();return()=>{request.current++}},[tournament?.id]);
  const visible=protocols.filter(row=>(!court||row.snapshot.court===court)&&(!kind||protocolKind(row)===kind));
  const current=protocols.find(row=>row.game_id===selected);
  async function download(rows:GameProtocol[],format:'json'|'pdf') {
    if(!tournament)return;
    setDownloading(true);setError('');
    try {
      const value=await exportGameProtocols({id:tournament.id,name:tournament.name},rows);
      if(format==='json')downloadProtocolJson(value);
      else{const {downloadProtocolPdf}=await import('../protocolPdf');await downloadProtocolPdf(value)}
    } catch(e){setError(e instanceof Error?e.message:'Download fehlgeschlagen.')}
    finally{setDownloading(false)}
  }
  if(dataMode!=='supabase')return <div className="status">Spielprotokolle stehen im Supabase-Betrieb zur Verfügung.</div>;
  if(!tournament)return <div className="empty">Bitte ein Turnier auswählen.</div>;
  return <section className="game-protocols" aria-label="Spielprotokolle">
    <div className="protocol-heading"><div><h2>Spielprotokolle</h2>{!current && <p>Bestätigte Spielstände und Änderungen. Details werden erst beim Öffnen geladen.</p>}</div>
      <button type="button" className="secondary" disabled={loading} onClick={()=>{setSelected('');void refresh()}}>Aktualisieren</button></div>
    {error&&<div className="error" role="alert">{error}</div>}
    {downloading&&<div className="status" role="status">Protokolle werden für den Download zusammengestellt…</div>}
    {current ? <>
      <div className="protocol-actions"><button type="button" className="secondary" aria-label="Alle Spielprotokolle" onClick={()=>setSelected('')}>← Übersicht</button>
        <button type="button" disabled={downloading} aria-label="Spiel als JSON" onClick={()=>void download([current],'json')}>JSON</button>
        <button type="button" disabled={downloading} aria-label="Spiel als PDF" onClick={()=>void download([current],'pdf')}>PDF kompakt</button></div>
      <ProtocolDetail key={current.game_id} protocol={current}/>
    </> : <>
      <div className="protocol-actions">
        <label>Court<select aria-label="Court" value={court} onChange={e=>setCourt(e.target.value)}><option value="">Alle Courts</option>{[...new Set(protocols.map(row=>String(row.snapshot.court??'')).filter(Boolean))].sort().map(value=><option key={value}>{value}</option>)}</select></label>
        <label>Erfassung<select aria-label="Erfassung" value={kind} onChange={e=>setKind(e.target.value)}><option value="">Alle Erfassungsarten</option>{[...new Set(protocols.map(protocolKind))].map(value=><option key={value}>{value}</option>)}</select></label>
        <button type="button" disabled={downloading||!visible.length} onClick={()=>void download(visible,'json')}>Liste als JSON ({visible.length})</button>
        <button type="button" disabled={downloading||!visible.length} onClick={()=>void download(visible,'pdf')}>Liste als PDF kompakt ({visible.length})</button>
      </div>
      {loading?<div className="status">Protokolle werden geladen…</div>:!visible.length?<div className="empty">Keine Spielprotokolle für diese Auswahl.</div>:
        <div className="protocol-table-wrap"><table className="protocol-table"><thead><tr><th>Spiel / Court</th><th>Teams</th><th>Ergebnis</th><th>Erfassung</th><th>Protokoll</th></tr></thead><tbody>
          {visible.map(row=><tr key={row.game_id}><td data-label="Spiel / Court">{protocolValue(row.snapshot.number)} / {protocolValue(row.snapshot.court)}{row.deleted&&<small>Spiel gelöscht</small>}</td>
            <td data-label="Teams">{protocolValue(row.snapshot.team_a)}<br/>{protocolValue(row.snapshot.team_b)}</td><td data-label="Ergebnis">{protocolValue(row.snapshot.result)}<small>{row.snapshot.completed?'Abgeschlossen':'Offen'}</small></td>
            <td data-label="Erfassung">{protocolKind(row)}{row.has_admin_changes&&<small>Adminänderungen vorhanden</small>}</td><td><button type="button" className="secondary" onClick={()=>setSelected(row.game_id)} aria-label={`Protokoll Spiel ${row.snapshot.number} öffnen`}>Öffnen</button></td></tr>)}
        </tbody></table></div>}
    </>}
  </section>;
}
function ProtocolDetail({protocol}:{protocol:GameProtocol}) {
  const [events,setEvents]=useState<ProtocolEvent[]>([]);const [loading,setLoading]=useState(true);const [more,setMore]=useState(true);const [error,setError]=useState('');
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;void load(0);return()=>{alive.current=false}},[protocol.game_id]);
  async function load(after:number) {
    setLoading(true);setError('');
    try{const rows=await loadProtocolEvents(protocol.game_id,after);if(alive.current){setEvents(current=>after?[...current,...rows]:rows);setMore(rows.length===100)}}
    catch(e){if(alive.current)setError(e instanceof Error?e.message:'Verlauf konnte nicht geladen werden.')}
    finally{if(alive.current)setLoading(false)}
  }
  const scoreLines = protocolScoreLines(events);
  const setResults = [1,2,3].filter(set => protocol.snapshot[`set${set}_team_a`] || protocol.snapshot[`set${set}_team_b`]).map(set => `S${set} ${protocolValue(protocol.snapshot[`set${set}_team_a`])}:${protocolValue(protocol.snapshot[`set${set}_team_b`])}`).join(' · ');
  return <article className="protocol-detail">
    <p className="protocol-game-line" tabIndex={0}><strong>#{protocol.snapshot.number} · {protocolValue(protocol.snapshot.team_a)} – {protocolValue(protocol.snapshot.team_b)}</strong> · C{protocolValue(protocol.snapshot.court)} · {protocolValue(protocol.snapshot.result)}{setResults && ` (${setResults})`} · SR: {protocolValue(protocol.snapshot.referee)} · {protocolKind(protocol)}</p>
    {error&&<div className="error" role="alert">{error}</div>}
    {scoreLines.length > 0 ? <div className="protocol-score-lines">
      {scoreLines.map(line => <div className="protocol-score-line" key={line.set}><strong>S{line.set}</strong><div className="protocol-score-track" tabIndex={0} aria-label={`Punkteverlauf Satz ${line.set}`}>
        {line.items.map((item,index) => <React.Fragment key={index}>{index>0 && <span className="protocol-score-arrow" aria-hidden="true"> → </span>}<span title={item.title}>{item.text}</span></React.Fragment>)}
      </div></div>)}
      <p className="protocol-note protocol-short-note">Seitlich scrollen · AZ = Auszeit · ↶ / ↺ = Korrektur</p>
    </div> : !loading && <p className="protocol-note protocol-short-note">Kein Live-Punkteverlauf in den geladenen Einträgen.</p>}
    <details className="protocol-audit-details"><summary>Speicherprotokoll · {events.length}{more ? '+' : ''} Einträge · Details</summary>
      <p className="protocol-note">Aufzeichnung seit {new Date(protocol.started_at).toLocaleString('de-DE')}. Zeiten zeigen die Serverbestätigung, bei Offline-Eingaben gegebenenfalls später. Ein Ergebnislink weist keine persönliche Identität nach. Übernommene oder teilweise erfasste Verläufe sind kein vollständiger Live-Nachweis.</p>
      <ol className="protocol-events protocol-events-compact">{events.map(event => <ProtocolEventItem key={event.id} event={event}/>)}</ol>
    </details>
    {loading&&<div className="status">Verlauf wird geladen…</div>}
    {!loading&&more&&<button type="button" className="secondary" onClick={()=>void load(events.at(-1)?.id??0)}>{error?'Erneut versuchen':'Weitere Einträge laden'}</button>}
  </article>;
}
