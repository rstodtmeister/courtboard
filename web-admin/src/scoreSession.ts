import { parseScoreSession, type ScoreSession } from "../../supabase/functions/_shared/score-session";
import { draftFromGame, withScoreAutomation } from "./scoreLogic";
import { historyDelta, historyEntries } from "./scorePatch";
import type { Game, GameDraft } from "./types";
import type { ScoreEntryResumeState } from "./workflowTypes";

const scoreKeys = ["set1_team_a", "set1_team_b", "set2_team_a", "set2_team_b", "set3_team_a", "set3_team_b"] as const;

export function serializeScoreSession(state: ScoreEntryResumeState): string {
  const { gameId: _id, draft, pointHistory, timeoutRemaining: _remaining, ...settings } = state;
  const session: ScoreSession = {
    ...settings, version: 1, finalEditing: state.finalEditing ?? false, timeoutEndsAt: state.timeoutEndsAt ?? (state.activeTimeoutTeam ? Date.now() + state.timeoutRemaining * 1000 : null),
    undo: pointHistory.slice(-120).map(({ draft: previous, ...snapshot }, index, snapshots) => ({
      ...snapshot, scores: scoreKeys.map(key => previous[key] ?? ""),
      // Reverse chronological deltas also preserve entries dropped from the
      // rolling history, without repeating the entire history for each undo.
      history: historyDelta(
        JSON.stringify(historyEntries((snapshots[index + 1]?.draft ?? draft).point_history).reverse()),
        JSON.stringify(historyEntries(previous.point_history).reverse())),
    })),
  };
  const encoded = JSON.stringify(session);
  parseScoreSession(encoded);
  return encoded;
}

export function restoreScoreSession(gameId: string, draft: GameDraft, now = Date.now()): ScoreEntryResumeState | null {
  const session = parseScoreSession(draft.score_entry_state);
  if (!session || draft.completed) return null;
  const { undo, version: _version, ...settings } = session;
  let history = historyEntries(draft.point_history).reverse();
  const pointHistory: ScoreEntryResumeState["pointHistory"] = [];
  for (const { scores, history: delta, ...snapshot } of [...undo].reverse()) {
    if (delta.drop + delta.keep > history.length) throw new Error("Rückgängig-Verlauf passt nicht zum Spielstand.");
    history = [...history.slice(delta.drop, delta.drop + delta.keep), ...delta.append];
    pointHistory.unshift({ ...snapshot, draft: withScoreAutomation({
      ...draft, score_entry_state: null,
      ...Object.fromEntries(scoreKeys.map((key, index) => [key, scores[index]])),
      point_history: JSON.stringify([...history].reverse()),
    }) });
  }
  const remaining = session.timeoutEndsAt === null ? 0 : Math.max(0, Math.min(30, Math.ceil((session.timeoutEndsAt - now) / 1000)));
  return {
    ...settings, playerLabels: settings.playerLabels ?? { A: null, B: null }, gameId, draft, timeoutRemaining: remaining,
    activeTimeoutTeam: remaining > 0 ? session.activeTimeoutTeam : null,
    timeoutEndsAt: remaining > 0 ? session.timeoutEndsAt : null,
    pointHistory,
  };
}

export function resumeForGame(game: Game, latest: GameDraft | null, local: ScoreEntryResumeState | null): ScoreEntryResumeState | null {
  const draft = latest ?? draftFromGame(game);
  if (game.completed || draft.completed) return null;
  // The server (or the pending outbox operation) owns both score and session.
  const remote = restoreScoreSession(game.id, draft);
  if (remote) return remote;
  // Upgrade an older browser-only session only when its score is still current.
  if (!local || local.gameId !== game.id
    || local.draft.team_a !== draft.team_a || local.draft.team_b !== draft.team_b
    || !scoreKeys.every(key => (local.draft[key] ?? "") === (draft[key] ?? ""))
    || JSON.stringify(historyEntries(local.draft.point_history)) !== JSON.stringify(historyEntries(draft.point_history))) return null;
  return { ...local, draft };
}
