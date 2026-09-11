import type { GameDraft } from './types';
export function historyEntries(value?: string | null): unknown[] {
  if (!value) return [];
  const entries: unknown = JSON.parse(value);
  if (!Array.isArray(entries)) throw new Error('Ungültiger gespeicherter Punkteverlauf.');
  return entries;
}
export function historyDelta(before: string | null | undefined, after: string | null | undefined) {
  const old = historyEntries(before), next = historyEntries(after);
  const oldKeys = old.map((entry) => JSON.stringify(entry)), nextKeys = next.map((entry) => JSON.stringify(entry));
  let drop = 0, keep = 0;
  for (let offset = 0; offset <= old.length; offset++) {
    let length = 0;
    while (offset + length < old.length && length < next.length && oldKeys[offset + length] === nextKeys[length]) length++;
    if (length > keep) { drop = offset; keep = length; }
  }
  return { drop, keep, append: next.slice(keep) };
}
export function scoreFields(draft: GameDraft) {
  return { referee: draft.referee, gameRating: draft.game_rating || 'Normal',
    set1TeamA: (draft.set1_team_a ?? ""), set1TeamB: (draft.set1_team_b ?? ""),
    set2TeamA: (draft.set2_team_a ?? ""), set2TeamB: (draft.set2_team_b ?? ""),
    set3TeamA: (draft.set3_team_a ?? ""), set3TeamB: (draft.set3_team_b ?? ""), completed: draft.completed };
}
export type ScoreCommand = ReturnType<typeof scoreFields> & {
  protocol: 2; operationId: string; baseRevision: number; historyDelta: ReturnType<typeof historyDelta>;
};
