import React, { useEffect, useRef, useState } from 'react';
import { dataMode } from '../dataApiCore';
import { downloadProtocolJson, exportGameProtocols, listGameProtocols, loadProtocolEvents } from '../dataApiProtocols';
import { historyDescription, protocolFieldLabels, protocolKind, protocolSourceLabels, protocolValue, type GameProtocol, type ProtocolEvent } from '../gameProtocols';
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
    <div className="protocol-heading"><div><h2>Spielprotokolle</h2><p>Bestätigte Spielstände und Änderungen. Details werden erst beim Öffnen geladen.</p></div>
      <button type="button" className="secondary" disabled={loading} onClick={()=>{setSelected('');void refresh()}}>Aktualisieren</button></div>
    {error&&<div className="error" role="alert">{error}</div>}
    {downloading&&<div className="status" role="status">Protokolle werden für den Download zusammengestellt…</div>}
    {current ? <>
      <div className="protocol-actions"><button type="button" className="secondary" onClick={()=>setSelected('')}>← Alle Spielprotokolle</button>
        <button type="button" disabled={downloading} onClick={()=>void download([current],'json')}>Spiel als JSON</button>
        <button type="button" disabled={downloading} onClick={()=>void download([current],'pdf')}>Spiel als PDF</button></div>
      <ProtocolDetail key={current.game_id} protocol={current}/>
    </> : <>
      <div className="protocol-actions">
        <label>Court<select aria-label="Court" value={court} onChange={e=>setCourt(e.target.value)}><option value="">Alle Courts</option>{[...new Set(protocols.map(row=>String(row.snapshot.court??'')).filter(Boolean))].sort().map(value=><option key={value}>{value}</option>)}</select></label>
        <label>Erfassung<select aria-label="Erfassung" value={kind} onChange={e=>setKind(e.target.value)}><option value="">Alle Erfassungsarten</option>{[...new Set(protocols.map(protocolKind))].map(value=><option key={value}>{value}</option>)}</select></label>
        <button type="button" disabled={downloading||!visible.length} onClick={()=>void download(visible,'json')}>Liste als JSON ({visible.length})</button>
        <button type="button" disabled={downloading||!visible.length} onClick={()=>void download(visible,'pdf')}>Liste als PDF ({visible.length})</button>
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
  return <article className="protocol-detail"><h3>Spiel {protocol.snapshot.number} · {protocolKind(protocol)}</h3>
    <p>{protocolValue(protocol.snapshot.team_a)} gegen {protocolValue(protocol.snapshot.team_b)} · Court {protocolValue(protocol.snapshot.court)}</p>
    <p>Ergebnis: <strong>{protocolValue(protocol.snapshot.result)}</strong> · Schiedsgericht: {protocolValue(protocol.snapshot.referee)}</p>
    <p className="protocol-note">Aufzeichnung seit {new Date(protocol.started_at).toLocaleString('de-DE')}. Zeitangaben zeigen die Serverbestätigung, bei Offline-Eingaben gegebenenfalls später. Ein Ergebnislink weist keine persönliche Identität nach. Übernommene oder teilweise erfasste Verläufe sind kein vollständiger Live-Nachweis.</p>
    {error&&<div className="error" role="alert">{error}</div>}
    <ol className="protocol-events">{events.map(event=><li key={event.id}>
      <div><strong>{event.action==='baseline'?'Ausgangsstand übernommen':event.action==='created'?'Spiel angelegt':event.action==='deleted'?'Spiel gelöscht':'Speicherung'}</strong> · {protocolSourceLabels[event.source]}{event.source==='admin'&&` · ${event.actor_label??event.actor_id??'Unbekannt'}`}</div>
      <time dateTime={event.recorded_at}>{new Date(event.recorded_at).toLocaleString('de-DE')}</time>
      {event.snapshot&&<details><summary>Ausgangsdaten anzeigen</summary><dl>{Object.entries(event.snapshot).map(([field,value])=><React.Fragment key={field}><dt>{protocolFieldLabels[field]??field}</dt><dd>{protocolValue(value)}</dd></React.Fragment>)}</dl></details>}
      {Object.keys(event.changes).length>0&&<ul>{Object.entries(event.changes).map(([field,change])=><li key={field}>{protocolFieldLabels[field]??field}: {protocolValue(change.before)} → <strong>{protocolValue(change.after)}</strong></li>)}</ul>}
      {event.history_change&&<details open={!('replace' in event.history_change)}><summary>Punkteverlauf / Auszeiten</summary><ul>{historyDescription(event).map((text,i)=><li key={i}>{text}</li>)}</ul></details>}
    </li>)}</ol>
    {loading&&<div className="status">Verlauf wird geladen…</div>}
    {!loading&&more&&<button type="button" className="secondary" onClick={()=>void load(events.at(-1)?.id??0)}>{error?'Erneut versuchen':'Weitere Einträge laden'}</button>}
  </article>;
}
