import React, { useEffect, useState } from 'react';
import { dataMode, scoreOutbox } from './dataApi';

export function ScoreWriterGuard({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(dataMode === 'local');
  const [error, setError] = useState('');
  useEffect(() => {
    if (dataMode === 'local') return;
    let stopped = false;
    let release: (() => void) | undefined;
    if (!navigator.locks) { setError('Dieser Browser unterstützt die sichere lokale Erfassung nicht. Bitte einen aktuellen Browser verwenden.'); return; }
    const online = () => scoreOutbox.retry();
    const visible = () => { if (document.visibilityState === 'visible') scoreOutbox.retry(); };
    const leaving = (event: BeforeUnloadEvent) => {
      if (scoreOutbox.records().some((record) => record.pending.length)) { event.preventDefault(); event.returnValue = ''; }
    };
    void navigator.locks.request('courtboard-score-writer', { ifAvailable: true }, async (lock) => {
      if (stopped) return;
      if (!lock) { setError('Die Erfassung ist auf diesem Gerät bereits in einem anderen Tab geöffnet. Bitte diesen schließen und hier neu laden.'); return; }
      scoreOutbox.start();
      window.addEventListener('online', online); window.addEventListener('offline', online); window.addEventListener('beforeunload', leaving);
      document.addEventListener('visibilitychange', visible);
      setReady(true);
      await new Promise<void>((resolve) => { release = resolve; });
    }).catch(() => setError('Die Erfassung konnte nicht sicher gestartet werden. Bitte neu laden.'));
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      void navigator.serviceWorker.register(new URL('score-worker.js', document.baseURI), { scope: new URL('./', document.baseURI).pathname }).catch(() => {});
    }
    return () => {
      stopped = true; scoreOutbox.stop(); release?.();
      window.removeEventListener('online', online); window.removeEventListener('offline', online); window.removeEventListener('beforeunload', leaving);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);
  if (!ready) return <main className="score-entry-page"><div className="status">{error || 'Erfassung wird vorbereitet…'}</div></main>;
  return <>{children}</>;
}
