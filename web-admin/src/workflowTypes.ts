import type { GameDraft } from "./types";

export type TeamKey = "A" | "B";
export type AdminTab = "games" | "courts" | "settings" | "admins";
export type ScoreWorkflowStep = "confirm" | "preview" | "servers" | "setup-preview" | "live" | "scoring" | "done";
export type ServerSetupStep = "captain-a" | "captain-b" | "serve-team" | "team-a" | "team-b" | "side-change";

export type PointHistoryEntry = {
  set: 1 | 2 | 3;
  team: TeamKey;
  scoreA: number;
  scoreB: number;
};

export type TimeoutHistoryEntry = {
  type: "timeout";
  set: 1 | 2 | 3;
  team: TeamKey;
  scoreA: number;
  scoreB: number;
  startedAt: string;
};

export type LiveSnapshot = {
  draft: GameDraft;
  leftTeam: TeamKey;
  setScore: Record<TeamKey, number>;
  servingTeam: TeamKey | "";
  serverIndex: Record<TeamKey, number>;
  serveCounts: Record<TeamKey, number>;
  sideChangeAck: number | null;
};

export type ScoreEntryResumeState = {
  gameId: string;
  draft: GameDraft;
  workflowStep: Exclude<ScoreWorkflowStep, "done">;
  serverSetupStep: ServerSetupStep;
  activeSet: 1 | 2 | 3;
  servingTeam: TeamKey | "";
  firstServerTeamA: string;
  firstServerTeamB: string;
  captainTeamA: string;
  captainTeamB: string;
  sideChangeInterval: 5 | 7 | null;
  leftTeam: TeamKey;
  setScore: Record<TeamKey, number>;
  serverIndex: Record<TeamKey, number>;
  serveCounts: Record<TeamKey, number>;
  correctionMode: boolean;
  sideChangeAck: number | null;
  timeoutScore: Record<TeamKey, string | null>;
  activeTimeoutTeam: TeamKey | null;
  timeoutRemaining: number;
};
