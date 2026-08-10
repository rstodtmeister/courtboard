import { draftFromGame, scoreForSet } from "./scoreLogic";
import type { Game } from "./types";
import type { TeamKey } from "./workflowTypes";

export function completedWinnerSide(game: Game): TeamKey | "" {
  if (game.winner_team === game.team_a || game.winner_team === "1") {
    return "A";
  }
  if (game.winner_team === game.team_b || game.winner_team === "2") {
    return "B";
  }
  const index = winnerIndexFromScores(game);
  return index === 1 ? "A" : index === 2 ? "B" : "";
}

export function completedResultParts(game: Game) {
  const result = game.result?.trim() || "";
  const match = result.match(/(\d+)\s*[:-]\s*(\d+)/);
  return {
    teamA: match?.[1] ?? "-",
    teamB: match?.[2] ?? "-",
  };
}

export function setPointClass(game: Game, setNumber: 1 | 2 | 3, team: TeamKey) {
  const score = scoreForSet(draftFromGame(game), setNumber);
  if (score.A === score.B) {
    return "";
  }
  return score[team] > score[team === "A" ? "B" : "A"] ? "set-winner" : "";
}

export function teamOptions(games: Game[]): string[] {
  const values = games.flatMap((game) => [game.team_a, game.team_b])
    .map((value) => (value ?? "").trim())
    .filter((value): value is string => Boolean(value) && value !== "(Freilos)");
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "de", { numeric: true }));
}

export function playersForTeam(team: string | null, players?: string[]) {
  const explicitPlayers = players?.map((player) => player.trim()).filter(Boolean);
  if (explicitPlayers && explicitPlayers.length >= 2) {
    return explicitPlayers.slice(0, 2);
  }
  const teamPlayers = playersFromTeamName(team);
  if (teamPlayers.length >= 2) {
    return teamPlayers.slice(0, 2);
  }
  const teamName = team || "Team";
  return [`${teamName} Spieler 1`, `${teamName} Spieler 2`];
}

export function shortTeamLabel(value: string | null | undefined, fallback: string) {
  const label = value?.replace(/\s*\(\d+\)\s*$/, "").trim() || fallback;
  return label.replace(/\s+-\s+/g, " / ");
}

function winnerIndexFromScores(game: Game) {
  const source = game.result || "";
  const match = source.match(/(\d+)\s*[:-]\s*(\d+)/);
  if (!match) {
    return 0;
  }
  const teamA = Number.parseInt(match[1], 10);
  const teamB = Number.parseInt(match[2], 10);
  if (teamA > teamB) {
    return 1;
  }
  if (teamB > teamA) {
    return 2;
  }
  return 0;
}

function playersFromTeamName(team: string | null) {
  return (team ?? "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .split(/\s*(?:\/|\s+-\s+)\s*/)
    .map((player) => player.trim())
    .filter(Boolean);
}
