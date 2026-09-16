import React, { useEffect, useRef, useState } from 'react';
import { dataMode, scoreOutbox, loadScoreConflict } from './dataApi';
import type { ScoreEntryData } from './types';

export function ScoreSyncStatus({ gameId, onResolved }: { gameId: string; onResolved: (data: ScoreEntryData) => void }) {
  const [, update] = useState(0);
  const resolved = useRef(onResolved);
  resolved.current = onResolved;
  useEffect(() => scoreOutbox.subscribe(() => update(value => value + 1)), []);
  useEffect(() => {
    if (dataMode !== 'supabase' || !gameId) return;
    let stopped = false;
    let checking = false;
    async function recover() {
      const status = scoreOutbox.status(gameId);
      if (stopped || checking || !status.revisionConflict || status.saving || status.storageFailure || !navigator.onLine) return;
      checking = true;
      try {
        const data = await loadScoreConflict(gameId);
        if (!stopped) resolved.current(data);
      } catch {
        // Keep the old queue blocked until an authoritative snapshot is available.
        // Network failures are retried without asking the referee to reconcile data.
      } finally { checking = false; }
    }
    const unsubscribe = scoreOutbox.subscribe(() => { void recover(); });
    const timer = window.setInterval(() => { void recover(); }, 2000);
    window.addEventListener('online', recover);
    void recover();
    return () => { stopped = true; unsubscribe(); window.clearInterval(timer); window.removeEventListener('online', recover); };
  }, [gameId]);
  const status = dataMode === 'supabase' && gameId ? scoreOutbox.status(gameId) : null;
  // Conflicts, retries and normal saving are handled silently. Only an actual
  // unavailable scoring session needs an operational message, without sync tools.
  if (!status?.blocked || status.revisionConflict) return null;
  return <div className="status score-sync-notice" role="status">Die Erfassung ist momentan nicht möglich. Bitte die Turnierleitung kontaktieren.</div>;
}
