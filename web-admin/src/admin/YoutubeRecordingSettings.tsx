import React, { useEffect, useState } from "react";
import { dataMode, getSupabase, supabaseFunctionErrorMessage } from "../dataApiCore";
import { youtubeVideoId } from "../stream";

type Recording = { started_at: string | null; offset_seconds: number; manual_start: boolean };
type Response = { recording: Recording | null; videoIds: string[]; automaticAvailable: boolean };

function localDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function YoutubeRecordingSettings({ tournamentId, url }: { tournamentId: string; url: string }) {
  const current = youtubeVideoId(url);
  const [selected, setSelected] = useState(current);
  const [ids, setIds] = useState<string[]>([]);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [start, setStart] = useState("");
  const [offset, setOffset] = useState("0");
  const [automatic, setAutomatic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState("");
  const controlId = React.useId();
  const videoIds = [...new Set([current, ...ids])];

  useEffect(() => {
    setSelected(current);
    setEditing(false);
  }, [current]);

  async function call(action: string, extra: object = {}) {
    const { data, error } = await getSupabase().functions.invoke("youtube-recording", { body: { action, tournamentId, videoId: selected, ...extra } });
    if (error) throw Error(await supabaseFunctionErrorMessage(error, "Videoeinstellungen konnten nicht geladen werden."));
    if (data?.error) throw Error(data.error);
    return data as Response;
  }

  function apply(data: Response) {
    setIds(data.videoIds);
    setAutomatic(data.automaticAvailable);
    setRecording(data.recording);
    setStart(localDate(data.recording?.started_at ?? null));
    setOffset(String(data.recording?.offset_seconds ?? 0));
  }

  useEffect(() => {
    if (!selected || dataMode !== "supabase") return;
    let active = true;
    setBusy(true);
    setLoaded(false);
    setStatus("");
    call("read")
      .then((data) => { if (active) apply(data); })
      .catch((error) => { if (active) setStatus(error.message); })
      .finally(() => { if (active) { setBusy(false); setLoaded(true); } });
    return () => { active = false; };
  }, [selected, tournamentId]);

  async function save(action: "save" | "refresh", startedAt?: string | null) {
    setBusy(true);
    setStatus("");
    try {
      const extra = action === "save"
        ? { startedAt: startedAt === undefined ? (start ? new Date(start).toISOString() : null) : startedAt, offsetSeconds: Number(offset) }
        : {};
      const data = await call(action, extra);
      apply(data);
      setEditing(false);
      setStatus(action === "save" ? "Aufzeichnungsbeginn gespeichert." : "Aufzeichnungsbeginn von YouTube übernommen.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  function changeOffset(amount: number) {
    setOffset((value) => String(Math.max(-86400, Math.min(86400, (Number(value) || 0) + amount))));
  }

  if (!current) return null;
  if (dataMode !== "supabase") return <p className="court-panel-help">Die Einrichtung des Aufzeichnungsbeginns ist im Onlinebetrieb verfügbar.</p>;

  const configured = Boolean(recording?.started_at);
  return (
    <section className="youtube-recording-settings" aria-labelledby={`${controlId}-heading`}>
      {!loaded && busy ? (
        <p className="court-panel-help">Aufzeichnungsbeginn wird geladen…</p>
      ) : configured && !editing ? (
        <>
          <div className="youtube-recording-status">
            <span aria-hidden="true">✓</span>
            <div>
              <h5 id={`${controlId}-heading`}>Aufzeichnung eingerichtet</h5>
              <strong>{displayDate(recording!.started_at!)}</strong>
              <small>{recording!.manual_start ? "Manuell festgelegt" : "Von YouTube übernommen"}</small>
            </div>
          </div>
          <button type="button" className="secondary youtube-recording-wide-action" onClick={() => { setEditing(true); setStatus(""); }}>
            Einstellung ändern
          </button>
        </>
      ) : editing ? (
        <>
          <h5 id={`${controlId}-heading`}>Aufzeichnungsbeginn ändern</h5>
          {videoIds.length > 1 && (
            <label>Aufzeichnung
              <select value={selected} onChange={(event) => setSelected(event.target.value)} disabled={busy}>
                {videoIds.map((id) => <option key={id} value={id}>{id}{id === current ? " (aktueller Stream)" : ""}</option>)}
              </select>
            </label>
          )}
          <label>Datum und Uhrzeit
            <input type="datetime-local" step="1" value={start} onChange={(event) => setStart(event.target.value)} disabled={busy} />
          </label>
          <details className="youtube-recording-advanced">
            <summary>Feineinstellung</summary>
            <label htmlFor={`${controlId}-offset`}>Video-Versatz</label>
            <div className="youtube-recording-offset">
              <button type="button" className="secondary" onClick={() => changeOffset(-5)} disabled={busy} aria-label="Video-Versatz um 5 Sekunden verringern">−5 s</button>
              <input id={`${controlId}-offset`} type="number" min="-86400" max="86400" step="1" value={offset} onChange={(event) => setOffset(event.target.value)} disabled={busy} aria-label="Video-Versatz in Sekunden" />
              <button type="button" className="secondary" onClick={() => changeOffset(5)} disabled={busy} aria-label="Video-Versatz um 5 Sekunden erhöhen">+5 s</button>
            </div>
            <p className="court-panel-help">Nur nötig, wenn Bild und Spielzeit nicht übereinstimmen.</p>
          </details>
          <div className="youtube-recording-actions">
            <button type="button" onClick={() => void save("save")} disabled={busy || !start}>{busy ? "Wird gespeichert…" : "Änderungen speichern"}</button>
            <button type="button" className="secondary" onClick={() => { setEditing(false); apply({ recording, videoIds: ids, automaticAvailable: automatic }); setStatus(""); }} disabled={busy}>Abbrechen</button>
            {configured && <button type="button" className="secondary" onClick={() => void save("save", null)} disabled={busy}>Beginn zurücksetzen</button>}
          </div>
        </>
      ) : (
        <>
          <h5 id={`${controlId}-heading`}>Aufzeichnungsbeginn einrichten</h5>
          <div className="youtube-recording-actions">
            <button type="button" onClick={() => void save("save", new Date().toISOString())} disabled={busy}>
              {busy ? "Wird gespeichert…" : "Jetzt als Beginn speichern"}
            </button>
            <button type="button" className="secondary" onClick={() => void save("refresh")} disabled={busy || !automatic}>
              Von YouTube übernehmen
            </button>
            <button type="button" className="secondary" onClick={() => { setEditing(true); setStatus(""); }} disabled={busy}>
              Anderen Zeitpunkt wählen
            </button>
          </div>
          {!automatic && <p className="court-panel-help">Die Übernahme von YouTube ist nicht eingerichtet.</p>}
        </>
      )}
      {status && <p role="status">{status}</p>}
    </section>
  );
}
