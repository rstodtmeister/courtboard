// Shared wire format for the referee's session. Scores and this state travel in
// the same operation. Undo histories form a chain of reverse chronological deltas
// starting at that operation's history, from newest undo to oldest.
type Team = "A" | "B";
type Pair<T> = Record<Team, T>;
export type ScoreSession = {
  version: 1;
  workflowStep: "confirm" | "preview" | "servers" | "setup-preview" | "live" | "scoring";
  serverSetupStep: "captain-a" | "captain-b" | "serve-team" | "team-a" | "team-b" | "side-change";
  activeSet: 1 | 2 | 3;
  servingTeam: Team | "";
  firstServerTeamA: string;
  firstServerTeamB: string;
  captainTeamA: string;
  captainTeamB: string;
  sideChangeInterval: 5 | 7 | null;
  leftTeam: Team;
  setScore: Pair<number>;
  serverIndex: Pair<number>;
  serveCounts: Pair<number>;
  correctionMode: boolean;
  finalEditing: boolean;
  sideChangeAck: number | null;
  timeoutScore: Pair<string | null>;
  activeTimeoutTeam: Team | null;
  timeoutEndsAt: number | null;
  undo: Array<{
    leftTeam: Team;
    setScore: Pair<number>;
    servingTeam: Team | "";
    serverIndex: Pair<number>;
    serveCounts: Pair<number>;
    sideChangeAck: number | null;
    scores: string[];
    history: { drop: number; keep: number; append: unknown[] };
  }>;
};
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const team = (v: unknown) => v === "A" || v === "B";
const integer = (v: unknown, max: number) => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= max;
const pair = (v: unknown, check: (v: unknown) => boolean) => object(v) && check(v.A) && check(v.B);
const label = (v: unknown) => typeof v === "string" && v.length <= 160;
const nullableScore = (v: unknown) => v === null || integer(v, 198);
const live = (v: Record<string, unknown>) => team(v.leftTeam) && (team(v.servingTeam) || v.servingTeam === "")
  && pair(v.setScore, n => integer(n, 99)) && pair(v.serverIndex, n => integer(n, 1))
  && pair(v.serveCounts, n => integer(n, 1000)) && nullableScore(v.sideChangeAck);

export function parseScoreSession(value: unknown): ScoreSession | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 200_000) throw new Error("Ungültiger oder zu großer Erfassungszustand.");
  let s: unknown;
  try { s = JSON.parse(value); } catch { throw new Error("Ungültiger Erfassungszustand."); }
  if (!object(s) || s.version !== 1
    || !["confirm", "preview", "servers", "setup-preview", "live", "scoring"].includes(String(s.workflowStep))
    || !["captain-a", "captain-b", "serve-team", "team-a", "team-b", "side-change"].includes(String(s.serverSetupStep))
    || ![1, 2, 3].includes(Number(s.activeSet)) || !Number.isInteger(s.activeSet)
    || !live(s) || ![s.firstServerTeamA, s.firstServerTeamB, s.captainTeamA, s.captainTeamB].every(label)
    || ![null, 5, 7].includes(s.sideChangeInterval as number | null)
    || typeof s.correctionMode !== "boolean" || typeof s.finalEditing !== "boolean"
    || !pair(s.timeoutScore, v => v === null || (typeof v === "string" && /^\d{1,2}:\d{1,2}$/.test(v)))
    || !(s.activeTimeoutTeam === null || team(s.activeTimeoutTeam))
    || !(s.timeoutEndsAt === null || integer(s.timeoutEndsAt, 8_640_000_000_000_000))
    || (s.activeTimeoutTeam !== null && s.timeoutEndsAt === null)
    || !Array.isArray(s.undo) || s.undo.length > 120
    || !s.undo.every(u => object(u) && live(u) && Array.isArray(u.scores) && u.scores.length === 6
      && u.scores.every(v => typeof v === "string" && /^\d{0,2}$/.test(v))
      && object(u.history) && integer(u.history.drop, 120) && integer(u.history.keep, 120)
      && Array.isArray(u.history.append) && Number(u.history.keep) + u.history.append.length <= 120
      && u.history.append.every(e => object(e) && [1,2,3].includes(Number(e.set)) && Number.isInteger(e.set)
        && team(e.team) && integer(e.scoreA,99) && integer(e.scoreB,99)
        && (e.type === undefined || (e.type === "timeout" && typeof e.startedAt === "string" && e.startedAt.length <= 64))))) {
    throw new Error("Ungültiger Erfassungszustand.");
  }
  if (s.workflowStep === "live" && (!team(s.servingTeam) || !s.firstServerTeamA || !s.firstServerTeamB || !s.sideChangeInterval)) {
    throw new Error("Unvollständige Aufschlagreihenfolge.");
  }
  return s as unknown as ScoreSession;
}
