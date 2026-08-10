import type { Game, GameDraft } from "./types";
import type { ScoreEntryResumeState, ScoreWorkflowStep, ServerSetupStep, TeamKey } from "./workflowTypes";

export type CompletedScoreEntryState = {
  game: Game;
  draft: GameDraft;
  completedAt: string;
};

const completedScoreEntryTtlMs = 5 * 60 * 1000;

export function loadCompletedScoreEntry(token: string): CompletedScoreEntryState | null {
  try {
    const raw = window.localStorage.getItem(completedScoreEntryKey(token));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<CompletedScoreEntryState>;
    if (!parsed.game || !parsed.draft || !parsed.completedAt) {
      clearCompletedScoreEntry(token);
      return null;
    }

    const completedAt = Date.parse(parsed.completedAt);
    if (!Number.isFinite(completedAt) || Date.now() - completedAt > completedScoreEntryTtlMs) {
      clearCompletedScoreEntry(token);
      return null;
    }

    return {
      game: parsed.game,
      draft: parsed.draft,
      completedAt: parsed.completedAt,
    };
  } catch {
    clearCompletedScoreEntry(token);
    return null;
  }
}

export function saveCompletedScoreEntry(token: string, state: CompletedScoreEntryState) {
  try {
    window.localStorage.setItem(completedScoreEntryKey(token), JSON.stringify(state));
  } catch {
    // Ignore storage failures; the submitted result is already persisted through the API.
  }
}

export function clearCompletedScoreEntry(token: string) {
  try {
    window.localStorage.removeItem(completedScoreEntryKey(token));
  } catch {
    // Ignore storage failures.
  }
}

export function loadScoreEntryResume(token: string): ScoreEntryResumeState | null {
  try {
    const raw = window.localStorage.getItem(scoreResumeKey(token));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<ScoreEntryResumeState> & { workflowStep?: unknown };
    if (!parsed.gameId || !parsed.draft || !isResumableWorkflowStep(parsed.workflowStep)) {
      return null;
    }
    return {
      gameId: parsed.gameId,
      draft: parsed.draft,
      workflowStep: parsed.workflowStep,
      serverSetupStep: isServerSetupStep(parsed.serverSetupStep) ? parsed.serverSetupStep : "serve-team",
      activeSet: isSetNumber(parsed.activeSet) ? parsed.activeSet : 1,
      servingTeam: isTeamKey(parsed.servingTeam) ? parsed.servingTeam : "",
      firstServerTeamA: parsed.firstServerTeamA ?? "",
      firstServerTeamB: parsed.firstServerTeamB ?? "",
      captainTeamA: parsed.captainTeamA ?? "",
      captainTeamB: parsed.captainTeamB ?? "",
      sideChangeInterval: parsed.sideChangeInterval === 5 || parsed.sideChangeInterval === 7 ? parsed.sideChangeInterval : null,
      leftTeam: isTeamKey(parsed.leftTeam) ? parsed.leftTeam : "A",
      setScore: normalizeTeamNumberRecord(parsed.setScore),
      serverIndex: normalizeTeamNumberRecord(parsed.serverIndex),
      serveCounts: normalizeTeamNumberRecord(parsed.serveCounts),
      correctionMode: Boolean(parsed.correctionMode),
      sideChangeAck: typeof parsed.sideChangeAck === "number" ? parsed.sideChangeAck : null,
      timeoutScore: normalizeTeamStringRecord(parsed.timeoutScore),
      activeTimeoutTeam: isTeamKey(parsed.activeTimeoutTeam) ? parsed.activeTimeoutTeam : null,
      timeoutRemaining: typeof parsed.timeoutRemaining === "number" ? Math.max(0, Math.min(30, parsed.timeoutRemaining)) : 0,
    };
  } catch {
    return null;
  }
}

export function saveScoreEntryResume(token: string, state: ScoreEntryResumeState) {
  try {
    window.localStorage.setItem(scoreResumeKey(token), JSON.stringify(state));
  } catch {
    // Ignore storage failures; live scoring still persists through the API.
  }
}

export function clearScoreEntryResume(token: string) {
  try {
    window.localStorage.removeItem(scoreResumeKey(token));
  } catch {
    // Ignore storage failures.
  }
}

function scoreResumeKey(token: string) {
  return `courtboard.score-entry.${token}`;
}

function completedScoreEntryKey(token: string) {
  return `courtboard.score-entry.completed.${token}`;
}

function isTeamKey(value: unknown): value is TeamKey {
  return value === "A" || value === "B";
}

function isSetNumber(value: unknown): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3;
}

function isServerSetupStep(value: unknown): value is ServerSetupStep {
  return value === "captain-a" || value === "captain-b" || value === "serve-team" || value === "team-a" || value === "team-b" || value === "side-change";
}

function isResumableWorkflowStep(value: unknown): value is Exclude<ScoreWorkflowStep, "done"> {
  return value === "confirm" || value === "preview" || value === "servers" || value === "setup-preview" || value === "live" || value === "scoring";
}

function normalizeTeamNumberRecord(value: unknown): Record<TeamKey, number> {
  const record = value && typeof value === "object" ? value as Partial<Record<TeamKey, unknown>> : {};
  return {
    A: typeof record.A === "number" ? record.A : 0,
    B: typeof record.B === "number" ? record.B : 0,
  };
}

function normalizeTeamStringRecord(value: unknown): Record<TeamKey, string | null> {
  const record = value && typeof value === "object" ? value as Partial<Record<TeamKey, unknown>> : {};
  return {
    A: typeof record.A === "string" ? record.A : null,
    B: typeof record.B === "string" ? record.B : null,
  };
}
