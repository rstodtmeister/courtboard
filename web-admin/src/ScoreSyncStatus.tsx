import React, { useEffect, useState } from 'react';
import { dataMode, scoreOutbox, loadScoreConflict } from './dataApi';
import { draftFromGame } from './scoreLogic';
import type { ScoreEntryData, GameDraft } from './types';
export function ScoreSyncStatus({ gameId, onResolved }: { gameId: string; onResolved: () => void }) {
  const [comparison, setComparison] = useState<ScoreEntryData | null>(null);
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState('');
  useEffect(() => { setComparison(null); setProblem(''); }, [gameId]);
  async function compare() {
    setChecking(true); setProblem('');
    try { setComparison(await loadScoreConflict(gameId)); }
    catch (error) { setProblem(error instanceof Error ? error.message : 'Abgleich fehlgeschlagen.'); }
    finally { setChecking(false); }
  }
  function adopt() {
    const game = comparison?.games.find(item => item.id === gameId);
    if (!game || !comparison) return;
    try {
      scoreOutbox.adoptServer(gameId, game, comparison, draftFromGame(game));
      setComparison(null); onResolved();
    } catch (error) { setProblem(error instanceof Error ? error.message : 'Übernahme fehlgeschlagen.'); }
  }
  const result = (draft: GameDraft) => [1, 2, 3].map(set => {
    const values = draft as unknown as Record<string, unknown>;
    return `${values[`set${set}_team_a`] || '0'}:${values[`set${set}_team_b`] || '0'}`;
  }).join(' · ');
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
    {status.blocked && !status.storageFailure && <div>
      <button type="button" disabled={checking || status.saving} onClick={() => void compare()}>{checking ? 'Lädt…' : 'Mit Serverstand abgleichen'}</button>
      {comparison && (() => {
        const game = comparison.games.find(item => item.id === gameId)!;
        const local = scoreOutbox.latest(gameId)!;
        return <div>
          <p>Spiel {game.number}: {game.team_a} – {game.team_b}</p>
          <p>Dieses Gerät: {result(local)} · Schiedsgericht: {local.referee || '–'}</p>
          <p>Server: {result(draftFromGame(game))} · Schiedsgericht: {game.referee || '–'}{game.completed ? ' · Abgeschlossen' : ''}</p>
          <p>Beim Übernehmen wird mit dem Serverstand fortgesetzt. Nicht übertragene lokale Eingaben werden separat auf diesem Gerät gesichert, aber nicht übernommen. Bei abweichendem Spielstand bitte zuerst mit der Turnierleitung abgleichen.</p>
          <button type="button" onClick={adopt}>Serverstand übernehmen und fortsetzen</button>
          <button type="button" onClick={() => setComparison(null)}>Abbrechen</button>
        </div>;
      })()}
      {problem && <p role="alert">{problem}</p>}
    </div>}
    {!offlineReady && <div>Offline-Seite wird vorbereitet. Diese Seite bis dahin geöffnet lassen.</div>}
    {(status.pending > 0 || status.blocked) && <div><button type="button" onClick={download}>Sicherung herunterladen</button>{status.storageFailure && <button type="button" onClick={() => { void scoreOutbox.resumeStorage(gameId).catch(() => {}); }}>Lokale Sicherung erneut versuchen</button>}{!status.blocked && <button type="button" onClick={() => scoreOutbox.retry()}>Jetzt erneut versuchen</button>}</div>}
  </div>;
}
