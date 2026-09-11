import React, { useEffect, useState } from 'react';
import { dataMode, scoreOutbox } from './dataApi';
export function ScoreSyncStatus({ gameId }: { gameId: string }) {
  const [, update] = useState(0);
  const [offlineReady, setOfflineReady] = useState(false);
  useEffect(() => scoreOutbox.subscribe(() => update((value) => value+1)), []);
  useEffect(() => {
    let stopped = false;
    if ('serviceWorker' in navigator) void navigator.serviceWorker.ready.then(() => { if (!stopped) setOfflineReady(true); });
    return () => { stopped = true; };
  }, []);
  if (dataMode !== 'supabase' || !gameId) return null;
  const status = scoreOutbox.status(gameId);
  function download() {
    const url = URL.createObjectURL(new Blob([scoreOutbox.export(gameId)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `spielstand-${gameId}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="status" role="status" aria-live="polite">
    {status.blocked || (status.pending ? `${status.pending} Eingabe(n) lokal gesichert – ${status.offline ? 'warten auf Verbindung' : 'werden übertragen'}.` : 'Alle Eingaben vom Server bestätigt.')}
    {!offlineReady && <div>Offline-Seite wird vorbereitet. Diese Seite bis dahin geöffnet lassen.</div>}
    {(status.pending > 0 || status.blocked) && <div><button type="button" onClick={download}>Sicherung herunterladen</button>{status.storageFailure && <button type="button" onClick={() => { void scoreOutbox.resumeStorage(gameId).catch(() => {}); }}>Lokale Sicherung erneut versuchen</button>}{!status.blocked && <button type="button" onClick={() => scoreOutbox.retry()}>Jetzt erneut versuchen</button>}</div>}
  </div>;
}
