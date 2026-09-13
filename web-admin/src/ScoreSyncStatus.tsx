import React, { useEffect, useState } from 'react';
import { dataMode, scoreOutbox } from './dataApi';
export function ScoreSyncStatus({ gameId }: { gameId: string }) {
  const [, update] = useState(0);
  const [offlineReady, setOfflineReady] = useState(false);
  const [waitingGameId, setWaitingGameId] = useState<string | null>(null);
  const status = dataMode === 'supabase' && gameId ? scoreOutbox.status(gameId) : null;
  const pending = Boolean(status?.pending);
  useEffect(() => {
    setWaitingGameId(null);
    if (!pending) return;
    const timer = window.setTimeout(() => setWaitingGameId(gameId), 5000);
    return () => window.clearTimeout(timer);
  }, [gameId, pending]);
  useEffect(() => scoreOutbox.subscribe(() => update((value) => value+1)), []);
  useEffect(() => {
    let stopped = false;
    if ('serviceWorker' in navigator) void navigator.serviceWorker.ready.then(() => { if (!stopped) setOfflineReady(true); });
    return () => { stopped = true; };
  }, []);
  if (!status) return null;
  const needsAttention = Boolean(status.blocked || status.offline || (pending && waitingGameId === gameId));
  if (!needsAttention) return null;
  function download() {
    const url = URL.createObjectURL(new Blob([scoreOutbox.export(gameId)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `spielstand-${gameId}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="status score-sync-notice" role="status">
    {status.blocked || (status.offline && !status.pending ? 'Offline – neue Eingaben werden zunächst auf diesem Gerät gespeichert.' : status.pending ? `${status.pending} Eingabe(n) lokal gesichert – ${status.offline ? 'warten auf Verbindung' : 'werden übertragen'}.` : 'Alle Eingaben vom Server bestätigt.')}
    {!offlineReady && <div>Offline-Seite wird vorbereitet. Diese Seite bis dahin geöffnet lassen.</div>}
    {(status.pending > 0 || status.blocked) && <div><button type="button" onClick={download}>Sicherung herunterladen</button>{status.storageFailure && <button type="button" onClick={() => { void scoreOutbox.resumeStorage(gameId).catch(() => {}); }}>Lokale Sicherung erneut versuchen</button>}{!status.blocked && <button type="button" onClick={() => scoreOutbox.retry()}>Jetzt erneut versuchen</button>}</div>}
  </div>;
}
