import type { Game, GameDraft } from "./types";
import type { PointHistoryEntry, TeamKey, TimeoutHistoryEntry } from "./workflowTypes";

export function serviceOrder(players: string[], firstServer: string) {
  if (!firstServer) {
    return players;
  }
  const second = secondServer(players, firstServer);
  return second ? [firstServer, second] : [firstServer];
}

export function secondServer(players: string[], firstServer: string) {
  if (!firstServer) {
    return "";
  }
  return players.find((player) => player !== firstServer) ?? "";
}

function numberFromScore(value?: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function scoreForSet(draft: GameDraft | null, setNumber: 1 | 2 | 3): Record<TeamKey, number> {
  if (!draft) {
    return { A: 0, B: 0 };
  }
  if (setNumber === 1) {
    return { A: numberFromScore(draft.set1_team_a), B: numberFromScore(draft.set1_team_b) };
  }
  if (setNumber === 2) {
    return { A: numberFromScore(draft.set2_team_a), B: numberFromScore(draft.set2_team_b) };
  }
  return { A: numberFromScore(draft.set3_team_a), B: numberFromScore(draft.set3_team_b) };
}

export function draftWithSetScore(draft: GameDraft, setNumber: 1 | 2 | 3, score: Record<TeamKey, number>): GameDraft {
  if (setNumber === 1) {
    return { ...draft, set1_team_a: String(score.A), set1_team_b: String(score.B) };
  }
  if (setNumber === 2) {
    return { ...draft, set2_team_a: String(score.A), set2_team_b: String(score.B) };
  }
  return { ...draft, set3_team_a: String(score.A), set3_team_b: String(score.B) };
}

export function clearSetScore(draft: GameDraft, setNumber: 1 | 2 | 3): GameDraft {
  if (setNumber === 1) {
    return { ...draft, set1_team_a: "", set1_team_b: "" };
  }
  if (setNumber === 2) {
    return { ...draft, set2_team_a: "", set2_team_b: "" };
  }
  return { ...draft, set3_team_a: "", set3_team_b: "" };
}

export function isPlausibleSetResult(score: Record<TeamKey, number>) {
  const high = Math.max(score.A, score.B);
  const diff = Math.abs(score.A - score.B);
  return high >= 15 && diff >= 2;
}

export function finalSetRows(draft: GameDraft) {
  return [
    { label: "Satz 1", teamA: draft.set1_team_a ?? "", teamB: draft.set1_team_b ?? "" },
    { label: "Satz 2", teamA: draft.set2_team_a ?? "", teamB: draft.set2_team_b ?? "" },
    { label: "Satz 3", teamA: draft.set3_team_a ?? "", teamB: draft.set3_team_b ?? "" },
  ].filter((row) => row.teamA || row.teamB);
}

export function completedSetRows(game: Game) {
  return [
    { label: "Satz 1", teamA: game.set1_team_a ?? "", teamB: game.set1_team_b ?? "" },
    { label: "Satz 2", teamA: game.set2_team_a ?? "", teamB: game.set2_team_b ?? "" },
    { label: "Satz 3", teamA: game.set3_team_a ?? "", teamB: game.set3_team_b ?? "" },
  ].filter((row) => {
    const teamA = parseScore(row.teamA);
    const teamB = parseScore(row.teamB);
    return teamA !== null && teamB !== null && isPlausibleSetResult({ A: teamA, B: teamB });
  });
}

export function setScoreForSide(row: { teamA: string; teamB: string }, leftTeam: TeamKey) {
  return leftTeam === "A" ? `${row.teamA}:${row.teamB}` : `${row.teamB}:${row.teamA}`;
}

export function draftFromGame(game: Game): GameDraft {
  return {
    court: game.court ?? "",
    referee: game.referee ?? "",
    team_a: game.team_a ?? "",
    team_b: game.team_b ?? "",
    result: game.result ?? "",
    winner_team: game.winner_team ?? "",
    game_rating: game.game_rating || "Normal",
    set1_team_a: game.set1_team_a ?? "",
    set1_team_b: game.set1_team_b ?? "",
    set2_team_a: game.set2_team_a ?? "",
    set2_team_b: game.set2_team_b ?? "",
    set3_team_a: game.set3_team_a ?? "",
    set3_team_b: game.set3_team_b ?? "",
    printed: game.printed,
    completed: game.completed,
    point_history: game.point_history ?? "",
  };
}

export function parsePointHistory(value: string | null | undefined): PointHistoryEntry[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as Array<Partial<PointHistoryEntry>>;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((entry): entry is PointHistoryEntry =>
        (entry.set === 1 || entry.set === 2 || entry.set === 3)
        && (entry.team === "A" || entry.team === "B")
        && typeof entry.scoreA === "number"
        && typeof entry.scoreB === "number",
      )
      .slice(-120);
  } catch {
    return [];
  }
}

export function parseTimeoutHistory(value: string | null | undefined): TimeoutHistoryEntry[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as Array<Partial<TimeoutHistoryEntry>>;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((entry): entry is TimeoutHistoryEntry =>
        entry.type === "timeout"
        && (entry.set === 1 || entry.set === 2 || entry.set === 3)
        && (entry.team === "A" || entry.team === "B")
        && typeof entry.scoreA === "number"
        && typeof entry.scoreB === "number"
        && typeof entry.startedAt === "string",
      )
      .slice(-20);
  } catch {
    return [];
  }
}

export function serializePointHistory(entries: Array<PointHistoryEntry | TimeoutHistoryEntry>) {
  return JSON.stringify(entries.slice(-120));
}

export function resultFromCompletedSetScores(game: Game) {
  const sets = [
    [game.set1_team_a, game.set1_team_b],
    [game.set2_team_a, game.set2_team_b],
    [game.set3_team_a, game.set3_team_b],
  ]
    .map(([teamA, teamB]) => [parseScore(teamA), parseScore(teamB)] as const)
    .filter(([teamA, teamB]) => teamA !== null && teamB !== null && isPlausibleSetResult({ A: teamA, B: teamB }));

  const hasSetScores = Boolean(game.set1_team_a || game.set1_team_b || game.set2_team_a || game.set2_team_b || game.set3_team_a || game.set3_team_b);
  if (sets.length === 0) {
    return hasSetScores ? "0:0" : "";
  }

  let teamAWonSets = 0;
  let teamBWonSets = 0;
  for (const [teamA, teamB] of sets) {
    if (teamA! > teamB!) {
      teamAWonSets++;
    } else {
      teamBWonSets++;
    }
  }
  return `${teamAWonSets}:${teamBWonSets}`;
}

export function withScoreAutomation(draft: GameDraft): GameDraft {
  const specialWinner = winnerFromSpecialRating(draft);
  if (specialWinner !== null) {
    return {
      ...draft,
      winner_team: specialWinner,
      result: draft.result ?? "",
    };
  }

  const sets = [
    [draft.set1_team_a, draft.set1_team_b],
    [draft.set2_team_a, draft.set2_team_b],
    [draft.set3_team_a, draft.set3_team_b],
  ]
    .map(([teamA, teamB]) => [parseScore(teamA), parseScore(teamB)] as const)
    .filter(([teamA, teamB]) => teamA !== null && teamB !== null && isPlausibleSetResult({ A: teamA, B: teamB }));

  if (sets.length === 0) {
    return {
      ...draft,
      result: draft.set1_team_a || draft.set1_team_b || draft.set2_team_a || draft.set2_team_b || draft.set3_team_a || draft.set3_team_b ? "0:0" : "",
      winner_team: "",
    };
  }

  let teamAWonSets = 0;
  let teamBWonSets = 0;
  for (const [teamA, teamB] of sets) {
    if (teamA! > teamB!) {
      teamAWonSets++;
    } else {
      teamBWonSets++;
    }
  }

  const result = `${teamAWonSets}:${teamBWonSets}`;
  const winner_team = teamAWonSets > teamBWonSets
    ? draft.team_a || "1"
    : teamBWonSets > teamAWonSets
      ? draft.team_b || "2"
      : "";

  return {
    ...draft,
    result,
    winner_team,
  };
}

export function validateManualResult(draft: GameDraft, options: { touchedSets?: Array<0 | 1 | 2> } = {}) {
  const errors: string[] = [];
  const sets = [
    { label: "Satz 1", score: { A: parseScore(draft.set1_team_a), B: parseScore(draft.set1_team_b) }, rawA: draft.set1_team_a, rawB: draft.set1_team_b },
    { label: "Satz 2", score: { A: parseScore(draft.set2_team_a), B: parseScore(draft.set2_team_b) }, rawA: draft.set2_team_a, rawB: draft.set2_team_b },
    { label: "Satz 3", score: { A: parseScore(draft.set3_team_a), B: parseScore(draft.set3_team_b) }, rawA: draft.set3_team_a, rawB: draft.set3_team_b },
  ];
  let teamAWins = 0;
  let teamBWins = 0;
  let validSetCount = 0;
  let incompleteSet = false;
  let matchDecidedAfterSet2 = false;

  for (let index = 0; index < sets.length; index++) {
    const set = sets[index];
    const hasA = Boolean((set.rawA ?? "").trim());
    const hasB = Boolean((set.rawB ?? "").trim());
    if (!hasA && !hasB) {
      continue;
    }
    if (hasA !== hasB || set.score.A === null || set.score.B === null) {
      incompleteSet = true;
      continue;
    }
    const setScore = { A: set.score.A, B: set.score.B };
    if (index > 0 && sets[index - 1].score.A === null && sets[index - 1].score.B === null) {
      if (options.touchedSets?.includes(index as 0 | 1 | 2) ?? true) {
        errors.push(`${set.label}: Vorheriger Satz fehlt.`);
      }
    }
    if (!isValidManualSetResult(setScore)) {
      if (options.touchedSets?.includes(index as 0 | 1 | 2) ?? true) {
        errors.push(`${set.label}: Ungültiges Satzergebnis. Ende bei 15 oder 21, sonst Verlängerung nur mit genau 2 Punkten Abstand.`);
      }
      continue;
    }
    if (matchDecidedAfterSet2) {
      if (options.touchedSets?.includes(index as 0 | 1 | 2) ?? true) {
        errors.push("Satz 3 darf nicht eingetragen werden, wenn ein Team die ersten zwei Sätze gewonnen hat.");
      }
      continue;
    }
    if (setScore.A > setScore.B) {
      teamAWins++;
    } else {
      teamBWins++;
    }
    validSetCount++;
    if (index === 1 && (teamAWins === 2 || teamBWins === 2)) {
      matchDecidedAfterSet2 = true;
    }
  }

  const valid = errors.length === 0 && !incompleteSet && (validSetCount === 1 || teamAWins >= 2 || teamBWins >= 2);
  return { errors: [...new Set(errors)], valid };
}

export function hasTwoSetLeadAfterSecondSet(draft: GameDraft) {
  const first = { A: parseScore(draft.set1_team_a), B: parseScore(draft.set1_team_b) };
  const second = { A: parseScore(draft.set2_team_a), B: parseScore(draft.set2_team_b) };
  if (first.A === null || first.B === null || second.A === null || second.B === null) {
    return false;
  }
  if (!isValidManualSetResult({ A: first.A, B: first.B }) || !isValidManualSetResult({ A: second.A, B: second.B })) {
    return false;
  }
  return (first.A > first.B && second.A > second.B) || (first.B > first.A && second.B > second.A);
}

function winnerFromSpecialRating(draft: GameDraft): string | null {
  const rating = (draft.game_rating ?? "").toLowerCase();
  if (!rating || rating === "normal") {
    return null;
  }

  const teamAFailed = rating.includes("verletzung a") || rating.includes("aufgabe a") || rating.includes("angetreten a");
  const teamBFailed = rating.includes("verletzung b") || rating.includes("aufgabe b") || rating.includes("angetreten b");

  if (teamAFailed && !teamBFailed) {
    return draft.team_b || "2";
  }
  if (teamBFailed && !teamAFailed) {
    return draft.team_a || "1";
  }
  return "";
}

export function parseScore(value: string | null) {
  if (value == null || value.trim() === "") {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidManualSetResult(score: Record<TeamKey, number>) {
  const winnerPoints = Math.max(score.A, score.B);
  const diff = Math.abs(score.A - score.B);
  if (winnerPoints < 15 || diff < 2) {
    return false;
  }
  return winnerPoints === 15 || winnerPoints === 21 || diff === 2;
}
