export type ProtocolSnapshot = Record<string, string | boolean | null>;
export type GameProtocol = {
  game_id: string; tournament_id: string; snapshot: ProtocolSnapshot; started_at: string; updated_at: string;
  event_count: number; has_live: boolean; has_result_entry: boolean; has_admin_changes: boolean;
  baseline_has_score: boolean; deleted: boolean;
};
export type ProtocolEvent = {
  id: number; game_id: string; recorded_at: string; source: 'baseline' | 'admin' | 'referee' | 'system';
  actor_id: string | null; actor_label: string | null; score_link_id: string | null;
  action: 'baseline' | 'created' | 'updated' | 'deleted';
  changes: Record<string, { before: unknown; after: unknown }>;
  history_change: { replace?: unknown; drop?: number; keep?: number; append?: unknown[] } | null;
  snapshot: ProtocolSnapshot | null;
};
export type ProtocolExport = { format: 'courtboard-game-protocol'; version: 1; exported_at: string;
  tournament: { id: string; name: string }; games: { protocol: GameProtocol; events: ProtocolEvent[] }[] };
export function protocolKind(protocol: GameProtocol) {
  if (protocol.has_live) return protocol.baseline_has_score || protocol.has_result_entry || protocol.has_admin_changes ? 'Teilweise live' : 'Live-Erfassung';
  if (protocol.has_admin_changes) return 'Admin-Eingabe';
  if (protocol.has_result_entry) return 'Nur Ergebnis';
  return protocol.baseline_has_score ? 'Übernommener Stand' : 'Noch keine Ergebniserfassung';
}
export const protocolFieldLabels: Record<string,string> = {
  number:'Spielnummer',round:'Runde',game_date:'Spieldatum',court:'Court',team_a:'Team A',team_b:'Team B',referee:'Schiedsgericht',
  game_rating:'Wertung',set1_team_a:'Satz 1 · A',set1_team_b:'Satz 1 · B',set2_team_a:'Satz 2 · A',set2_team_b:'Satz 2 · B',
  set3_team_a:'Satz 3 · A',set3_team_b:'Satz 3 · B',result:'Ergebnis',winner_team:'Sieger',completed:'Abgeschlossen',
};
export const protocolSourceLabels = {baseline:'Übernommener Ausgangsstand',admin:'Admin',referee:'Schiedsrichter-Ergebnislink',system:'Import / System'};
export function protocolValue(value: unknown) { return value === true ? 'Ja' : value === false ? 'Nein' : value == null || value === '' ? '–' : String(value); }
export function historyDescription(event: ProtocolEvent) {
  const history = event.history_change;
  if (!history) return [];
  const entries = 'replace' in history ? history.replace : history.append;
  const lines: string[] = [];
  if ('replace' in history) lines.push('Gespeicherter Verlauf als Ausgangsstand / Ersatz (kein Beleg für einen vollständigen Spielverlauf).');
  else {
    if (history.drop) lines.push(`${history.drop} ältere Einträge aus dem laufenden Anzeigefenster entfernt; im Protokoll bleiben sie erhalten.`);
    lines.push(`Verlauf: ${history.keep ?? 0} Einträge beibehalten, danach ${(history.append ?? []).length} angefügt. Rücknahmen ersetzen das bisherige Ende.`);
  }
  if (Array.isArray(entries)) for (const value of entries) {
    if (value && typeof value === 'object') {
      const entry = value as Record<string,unknown>;
      lines.push(`Satz ${entry.set}: ${entry.type === 'timeout' ? 'Auszeit' : 'Punkt'} ${entry.team}, Stand ${entry.scoreA}:${entry.scoreB}${entry.startedAt ? ` · Beginn ${entry.startedAt}` : ''}`);
    }
  }
  else lines.push('Älterer Verlauf nicht lesbar; Originaldaten bleiben im JSON-Download enthalten.');
  return lines;
}

export function protocolEventSummary(event: ProtocolEvent) {
  if (event.action === 'baseline') return 'Ausgangsstand übernommen';
  if (event.action === 'created') return 'Spiel angelegt';
  if (event.action === 'deleted') return 'Spiel gelöscht';
  if (event.changes.completed?.after === true) return 'Spiel abgeschlossen';
  if (event.changes.completed?.after === false) return 'Spiel wieder geöffnet';
  const scores = Object.entries(event.changes).filter(([key]) => /^set[123]_team_[ab]$/.test(key));
  const decreased = scores.some(([, change]) => change.before != null && change.before !== '' && change.after != null && change.after !== '' && Number(change.after) < Number(change.before));
  const last = event.history_change?.append?.at(-1);
  if (last && typeof last === 'object') {
    const entry = last as Record<string, unknown>;
    if ([1, 2, 3].includes(Number(entry.set)) && ['A', 'B'].includes(String(entry.team)) && Number.isInteger(entry.scoreA) && Number.isInteger(entry.scoreB)) {
      const action = entry.type === 'timeout' ? `Auszeit ${entry.team}` : decreased ? 'Korrektur' : `Punkt ${entry.team}`;
      return `Satz ${entry.set} · ${entry.scoreA}:${entry.scoreB} · ${action}${(event.history_change?.append?.length ?? 0) > 1 ? ` (${event.history_change!.append!.length} Einträge)` : ''}`;
    }
  }
  if (scores.length) {
    const action = decreased ? 'Rücknahme / Korrektur' : event.source === 'admin' ? 'Ergebniskorrektur' : 'Ergebnis';
    return `${action} · ${scores.map(([key, change]) => `S${key[3]} ${key.at(-1)!.toUpperCase()}: ${protocolValue(change.before)} → ${protocolValue(change.after)}`).join(' · ')}`;
  }
  if (event.history_change) return 'Punkteverlauf geändert';
  const fields = Object.keys(event.changes).map(field => protocolFieldLabels[field] ?? field);
  return fields.length ? fields.join(' · ') : 'Speicherung';
}

export type ProtocolScoreLine = { set: number; items: { text: string; title: string }[] };
export function protocolScoreLines(events: ProtocolEvent[]): ProtocolScoreLine[] {
  const lines = new Map<number, ProtocolScoreLine>();
  let window: Record<string, unknown>[] = [];
  let state: ProtocolSnapshot = {};
  const add = (set: number, text: string, title: string) => {
    if (![1, 2, 3].includes(set)) return;
    if (!lines.has(set)) lines.set(set, { set, items: [] });
    lines.get(set)!.items.push({ text, title });
  };
  const entries = (value: unknown) => Array.isArray(value) ? value.filter((item): item is Record<string, unknown> =>
    !!item && typeof item === 'object' && [1, 2, 3].includes(item.set) && Number.isInteger(item.scoreA) && Number.isInteger(item.scoreB)) : [];
  for (const event of events) {
    if (event.snapshot) state = { ...event.snapshot };
    for (const [key, change] of Object.entries(event.changes)) state[key] = change.after as string | boolean | null;
    const edit = event.history_change;
    if (!edit) continue; // Result-only saves must not become fictional live points.
    const title = `${new Date(event.recorded_at).toLocaleString('de-DE')} · ${protocolSourceLabels[event.source]}`;
    if ('replace' in edit) {
      const replaced = window;
      window = entries(edit.replace);
      if (event.action === 'baseline' || event.action === 'created') {
        const seen = new Set<number>();
        for (const item of window) {
          const set = Number(item.set);
          if (!seen.has(set)) { add(set, 'Bestand:', 'Übernommener Verlauf; Vollständigkeit unbekannt'); seen.add(set); }
          add(set, `${item.type === 'timeout' ? `AZ ${item.team} ` : ''}${item.scoreA}:${item.scoreB}`, title);
        }
      } else {
        for (const set of [1, 2, 3]) {
          const last = window.filter(item => item.set === set).at(-1);
          if (last) add(set, `↺ ${last.scoreA}:${last.scoreB}`, `${title} · Verlauf ersetzt; Details im Speicherprotokoll`);
          else if (replaced.some(item => item.set === set)) add(set, '↺ Verlauf gelöscht', title);
        }
      }
      continue;
    }
    const previous = window;
    const appended = entries(edit.append);
    const drop = edit.drop ?? 0, keep = edit.keep ?? 0;
    const shortened = drop + keep < previous.length;
    window = [...previous.slice(drop, drop + keep), ...appended];
    if (appended.length === 1 && !shortened) {
      const item = appended[0];
      add(Number(item.set), `${item.type === 'timeout' ? `AZ ${item.team} ` : ''}${item.scoreA}:${item.scoreB}`, title);
    } else if (appended.length || shortened) {
      const changedSets = [1, 2, 3].filter(set => Object.keys(event.changes).some(key => key.startsWith(`set${set}_team_`)));
      const sets = changedSets.length ? changedSets : [...new Set([...appended, ...previous.slice(drop + keep)].map(item => Number(item.set)))];
      for (const set of sets) {
        const last = window.filter(item => item.set === set).at(-1);
        const a = state[`set${set}_team_a`] ?? last?.scoreA;
        const b = state[`set${set}_team_b`] ?? last?.scoreB;
        add(set, `${shortened ? "↶" : "↺"} ${protocolValue(a)}:${protocolValue(b)}`, `${title} · ${shortened ? "Rücknahme / Verlaufsänderung" : "Verlauf ergänzt / ersetzt"}`);
      }
    }
  }
  return [...lines.values()].sort((a, b) => a.set - b.set);
}
