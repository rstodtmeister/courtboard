import React, { useEffect, useState } from 'react';
import { getScoreDeliveryStatus } from './dataApi';

export function HvvDeliveryStatus({ token, gameId }: { token: string; gameId: string }) {
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false, running = false, finished = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setStatus(null);
    async function refresh() {
      if (disposed || running || finished || document.visibilityState === 'hidden') return;
      clearTimeout(timer);
      running = true;
      try {
        const next = await getScoreDeliveryStatus(token, gameId);
        if (!disposed) {
          setStatus(next);
          finished = next === null || ['succeeded','failed','cancelled','not_configured'].includes(next);
        }
      } catch { if (!disposed) setStatus('unavailable'); }
      finally {
        running = false;
        if (!disposed && !finished) timer = setTimeout(refresh, 15_000);
      }
    }
    function visible() {
      clearTimeout(timer);
      if (document.visibilityState !== 'hidden') void refresh();
    }
    document.addEventListener('visibilitychange', visible);
    void refresh();
    return () => { disposed = true; clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, [token, gameId]);
  if (!status) return null;
  const message = status === 'succeeded' ? 'Ergebnis an den HVV übertragen.'
    : status === 'not_configured' ? 'Für dieses Spiel ist keine HVV-Übertragung eingerichtet.'
    : status === 'failed' || status === 'cancelled' ? 'Ergebnis gespeichert. Bitte die Turnierleitung zur HVV-Übertragung kontaktieren.'
    : status === 'retry' ? 'Ergebnis gespeichert. Die HVV-Übertragung wird erneut versucht.'
    : status === 'unavailable' ? 'Ergebnis gespeichert. HVV-Status momentan nicht verfügbar.'
    : 'Ergebnis gespeichert. Die HVV-Übertragung läuft im Hintergrund.';
  return <div className="status" role="status">{message}</div>;
}
