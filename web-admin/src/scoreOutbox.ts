import type { Game, GameDraft, ScoreEntryData } from './types';
import { historyDelta, scoreFields, type ScoreCommand } from './scorePatch';
export type ScoreAck = { ok: boolean; operationId: string; revision: number; completed: boolean };
type Operation = { id: string; draft: GameDraft; command?: ScoreCommand };
export type OutboxRecord = { version: 2; token: string; game: Game; context: ScoreEntryData; deviceId: string; revision: number;
  acknowledged: GameDraft; pending: Operation[]; blocked?: string; updatedAt: number };
export type OutboxStatus = { pending: number; blocked: string; offline: boolean; saving: boolean; completing: boolean; storageFailure: boolean };
export class ScoreTransportError extends Error {
  constructor(message: string, readonly permanent: boolean) { super(message); }
}
// Storage writes are synchronous: a point is journaled before submitScore returns.
// The caller holds an exclusive Web Lock for this origin's scoring page.
export function createScoreOutbox(options: {
  storage: Pick<Storage, 'getItem' | 'setItem' | 'key' | 'length'>;
  send: (record: OutboxRecord, command: ScoreCommand) => Promise<ScoreAck>;
  uuid: () => string;
  online: () => boolean;
}) {
  const prefix = 'courtboard.outbox.v2.';
  const listeners = new Set<() => void>();
  const running = new Map<string, number>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const waiters = new Map<string, { resolve: () => void; reject: (error: Error) => void }[]>();
  const storageErrors = new Map<string, { message: string; draft?: GameDraft }>();
  const failures = new Map<string, number>();
  let active = false, generation = 0;
  const notify = () => listeners.forEach((fn) => fn());
  function read(id: string): OutboxRecord | null {
    const raw = options.storage.getItem(prefix + id);
    if (!raw) return null;
    const record = JSON.parse(raw) as OutboxRecord;
    if (record.version !== 2 || !Array.isArray(record.pending)) throw new Error('Die lokale Spielstandsdatei ist nicht lesbar.');
    return record;
  }
  function write(id: string, record: OutboxRecord) {
    try { options.storage.setItem(prefix + id, JSON.stringify(record)); }
    catch {
      storageErrors.set(id, { ...storageErrors.get(id), message: 'Lokaler Speicher nicht verfügbar. Bitte keine weiteren Punkte eingeben und die Sicherung herunterladen.' });
      notify();
      throw new Error('Die Eingabe konnte nicht lokal gesichert werden.');
    }
  }
  function records() {
    const result: OutboxRecord[] = [];
    for (let i = 0; i < options.storage.length; i++) {
      const key = options.storage.key(i);
      if (key?.startsWith(prefix)) { const record = read(key.slice(prefix.length)); if (record) result.push(record); }
    }
    return result;
  }
  function settle(id: string, error?: Error) {
    for (const waiter of waiters.get(id) ?? []) error ? waiter.reject(error) : waiter.resolve();
    waiters.delete(id);
  }
  function schedule(id: string, delay: number) {
    clearTimeout(timers.get(id));
    if (active) timers.set(id, setTimeout(() => { timers.delete(id); void drain(id); }, delay));
  }
  async function drain(id: string) {
    if (!active || running.get(id) === generation || !options.online()) { notify(); return; }
    const run = generation;
    running.set(id, run); notify();
    try {
      while (active && run === generation && options.online()) {
        let record = read(id);
        if (!record || record.blocked || !record.pending.length) break;
        const operation = record.pending[0];
        if (!operation.command) {
          operation.command = { ...scoreFields(operation.draft), protocol: 2, operationId: operation.id,
            baseRevision: record.revision, historyDelta: historyDelta(record.acknowledged.point_history, operation.draft.point_history) };
          write(id, record); // Freeze the exact retry before starting HTTP.
        }
        try {
          const ack = await options.send(record, operation.command);
          if (!active || run !== generation) return; // An old tab must never alter a new tab's journal.
          if (!ack.ok || ack.operationId !== operation.id || ack.completed !== operation.draft.completed || !Number.isSafeInteger(ack.revision) || ack.revision < record.revision) {
            throw new ScoreTransportError('Unpassende Serverbestätigung. Eingaben bleiben lokal erhalten.', true);
          }
          record = read(id)!; // Retain points added while HTTP was in flight.
          if (record.pending[0]?.id !== operation.id) throw new ScoreTransportError('Die lokale Speicherreihenfolge hat sich geändert.', true);
          record.pending.shift(); record.acknowledged = operation.draft; record.revision = ack.revision; record.updatedAt = Date.now();
          write(id, record);
          failures.delete(id); settle(operation.id); notify();
        } catch (error) {
          if (!active || run !== generation) return;
          if (error instanceof ScoreTransportError && error.permanent) {
            record = read(id)!; record.blocked = error.message; write(id, record);
            for (const pending of record.pending) settle(pending.id, error);
          } else {
            const attempts = (failures.get(id) ?? 0) + 1; failures.set(id, attempts);
            schedule(id, Math.min(30_000, 1000 * 2 ** Math.min(attempts - 1, 5)));
          }
          break; // Never overtake or silently discard an unacknowledged operation.
        }
      }
    } catch (error) {
      storageErrors.set(id, { ...storageErrors.get(id), message: error instanceof Error ? error.message : 'Lokale Sicherung nicht verfügbar.' });
      try {
        const record = read(id);
        for (const operation of record?.pending ?? []) settle(operation.id, new Error('Lokale Sicherung prüfen.'));
      } catch { /* Keep unreadable storage untouched for recovery. */ }
    } finally {
      if (running.get(id) === run) running.delete(id);
      notify();
    }
  }
  const api = {
    read, records,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    start() { active = true; generation++; },
    stop() { active = false; generation++; timers.forEach(clearTimeout); timers.clear(); },
    retry() { for (const record of records()) if (record.pending.length) { clearTimeout(timers.get(record.game.id)); timers.delete(record.game.id); void drain(record.game.id); } },
    initialize(token: string, game: Game, context: ScoreEntryData, deviceId: string, draft: GameDraft) {
      const existing = read(game.id);
      if (existing?.pending.length || existing?.blocked) return existing;
      if (!Number.isSafeInteger(game.score_revision)) throw new Error('Der Server unterstützt die sichere Erfassung noch nicht. Bitte neu laden.');
      const record: OutboxRecord = { version: 2, token, game, context: { ...context, games: [game] }, deviceId,
        revision: game.score_revision!, acknowledged: draft, pending: [], updatedAt: Date.now() };
      write(game.id, record); return record;
    },
    cached(token: string) { return records().filter((record) => record.token === token).sort((a,b) =>
      Number(b.pending.length > 0) - Number(a.pending.length > 0) || b.updatedAt - a.updatedAt)[0] ?? null; },
    latest(id: string) { const record = read(id); return record?.pending.at(-1)?.draft ?? record?.acknowledged ?? null; },
    status(id: string): OutboxStatus {
      const record = read(id);
      return { pending: record?.pending.length ?? 0, storageFailure: storageErrors.has(id), blocked: storageErrors.get(id)?.message || record?.blocked || '',
        offline: !options.online() || failures.has(id), saving: running.has(id), completing: record?.pending.some((op) => op.draft.completed) ?? false };
    },
    async resumeStorage(id: string): Promise<void> {
      const failure = storageErrors.get(id);
      const record = read(id);
      if (!failure || !record || record.blocked) return;
      write(id, record); // Verify storage before accepting another point.
      if (record.pending.length >= 250) { void drain(id); return; }
      storageErrors.delete(id); notify();
      if (failure.draft) await api.enqueue(id, failure.draft);
      else void drain(id);
    },
    export(id: string) { const record = read(id); return JSON.stringify({ ...record, token: undefined, deviceId: undefined,
      context: undefined, unsavedDraft: storageErrors.get(id)?.draft }, null, 2); },
    enqueue(id: string, draft: GameDraft): Promise<void> {
      if (!active) return Promise.reject(new Error('Diese Erfassungsseite ist nicht aktiv.'));
      const record = read(id);
      if (!record) return Promise.reject(new Error('Das Spiel wurde noch nicht für die Erfassung geladen.'));
      if (record.blocked || storageErrors.has(id)) return Promise.reject(new Error(record.blocked || storageErrors.get(id)!.message));
      // A second click on an unacknowledged final result waits for the same receipt.
      let operation = record.pending.at(-1);
      if (!operation || JSON.stringify(operation.draft) !== JSON.stringify(draft)) {
        if (record.pending.some((op) => op.draft.completed)) return Promise.reject(new Error('Der Spielabschluss wartet noch auf Bestätigung.'));
        if (record.pending.length >= 250) { storageErrors.set(id, { message: '250 Eingaben warten auf Übertragung. Die letzte Eingabe ist noch nicht gesichert. Bitte Verbindung wiederherstellen und Sicherung herunterladen.', draft }); notify(); return Promise.reject(new Error('Lokale Warteschlange voll.')); }
        operation = { id: options.uuid(), draft: { ...draft } };
        record.pending.push(operation); record.updatedAt = Date.now();
        try { write(id, record); } catch (error) {
          storageErrors.set(id, { message: 'Diese letzte Eingabe ist NICHT lokal gesichert. Sicherung herunterladen und Speicherproblem beheben.', draft });
          notify(); return Promise.reject(error);
        }
      }
      const operationId = operation.id;
      const result = draft.completed ? new Promise<void>((resolve,reject) => {
        waiters.set(operationId, [...(waiters.get(operationId) ?? []), { resolve, reject }]);
      }) : Promise.resolve();
      notify(); if (!timers.has(id)) void drain(id); return result;
    },
  };
  return api;
}
