import type { Game } from "./types";

export type RefereeSuggestion = { team: string; reason: string };
type Round = { kind: "group" | "winner" | "loser" | "knockout" | "semi" | "final" | "unknown"; stage?: number; group?: string };

export function refereeRound(value: string | null | undefined): Round {
  const round = (value ?? "").trim().toUpperCase();
  if (/^(F|1F|FINALE|FINAL|3P|P3|3\.?\s*PLATZ|SPIEL UM PLATZ 3)$/.test(round)) return { kind: "final" };
  if (/^(2F|HF|HALBFINALE|SEMIFINAL)$/.test(round)) return { kind: "semi" };
  const tree = round.match(/^([WL])\s*(\d+)?$/);
  if (tree) return { kind: tree[1] === "W" ? "winner" : "loser", stage: tree[2] ? Number(tree[2]) : undefined };
  const knockout = round.match(/^(\d+)F$/);
  if (knockout && Number(knockout[1]) >= 4) return { kind: "knockout", stage: Number(knockout[1]) };
  const group = round.match(/^(?:(?:GRUPPE|POOL)\s+)?([A-KM-VX-Z])$/);
  return group ? { kind: "group", group: group[1] } : { kind: "unknown" };
}

const teamName = (value: string | null | undefined) => (value ?? "").trim();
const participants = (game: Game) => [teamName(game.team_a), teamName(game.team_b)];
const knownTeam = (team: string) => Boolean(team) && !/freilos|^__|\b(offen|tbd)\b|^(sieger|gewinner|verlierer|winner|loser)\b|^(platz|rang)\s*\d|^(pool|gruppe)\s+\w+\s+(platz|rang)/i.test(team);
const finished = (game: Game) => Boolean(game.completed || (game.game_rating && game.game_rating !== "Normal"));
const order = (game: Game) => game.display_order ?? Number(game.number.match(/\d+/)?.[0] ?? Number.MAX_SAFE_INTEGER);
const compare = (a: Game, b: Game) => order(a) - order(b) || a.number.localeCompare(b.number, "de", { numeric: true });

function outcome(game: Game, loser: boolean): string | undefined {
  if (!finished(game)) return;
  const teams = participants(game);
  const winner = teamName(game.winner_team);
  let side = winner === teams[0] || winner === "1" ? 0 : winner === teams[1] || winner === "2" ? 1 : -1;
  if (side < 0) {
    const result = game.result?.match(/^\s*(\d+)\s*:\s*(\d+)\s*$/);
    if (result && Number(result[1]) !== Number(result[2])) side = Number(result[1]) > Number(result[2]) ? 0 : 1;
  }
  return side < 0 ? undefined : teams[loser ? 1 - side : side];
}

/** Pure recommendations: imported and manually assigned referees are never changed. */
export function refereeSuggestions(game: Game, allGames: Game[]): RefereeSuggestion[] {
  const games = allGames.filter(candidate => candidate.tournament_id === game.tournament_id).map(candidate => candidate.id === game.id ? game : candidate);
  const round = refereeRound(game.round);
  if (finished(game) || round.kind === "unknown" || round.kind === "final") return [];
  const available = (team: string) => knownTeam(team) && !participants(game).includes(team) && !games.some(candidate => {
    if (candidate.id === game.id || finished(candidate) || candidate.court === game.court) return false;
    const concurrent = Boolean(candidate.score_locked_by_device) || Boolean(game.game_date && /[T ]\d{2}:\d{2}/.test(game.game_date) && candidate.game_date === game.game_date);
    return concurrent && (participants(candidate).includes(team) || teamName(candidate.referee) === team);
  });
  const recommend = (teams: Array<string | undefined>, reason: string) => [...new Set(teams.filter((team): team is string => Boolean(team)))].filter(available).map(team => ({ team, reason }));
  if (round.kind === "group") {
    const groupGames = games.filter(candidate => refereeRound(candidate.round).group === round.group);
    const candidates = [...new Set(groupGames.flatMap(participants))].filter(available);
    const assignments = (team: string) => groupGames.filter(candidate => candidate.id !== game.id && teamName(candidate.referee) === team).length;
    const minimum = Math.min(...candidates.map(assignments));
    return recommend(candidates.filter(team => assignments(team) === minimum), "Spielfrei in der Gruppe · bisher am seltensten eingeteilt");
  }
  if (!game.court || Number(game.court) <= 0) return [];
  const courtGames = games.filter(candidate => candidate.court === game.court).sort(compare);
  const index = courtGames.findIndex(candidate => candidate.id === game.id);
  const previous = courtGames[index - 1];
  const previousRound = refereeRound(previous?.round);
  const doubleKo = games.some(candidate => ["winner", "loser"].includes(refereeRound(candidate.round).kind));
  const openingKnockoutStage = Math.max(...games.map(candidate => {
    const candidateRound = refereeRound(candidate.round);
    return candidateRound.kind === "knockout" ? candidateRound.stage ?? 0 : 0;
  }));
  const firstRound = (round.kind === "winner" && round.stage === 1)
    || (round.kind === "knockout" && round.stage === openingKnockoutStage);
  if (firstRound) {
    const future = courtGames.slice(index + 1).filter(candidate => {
      const kind = refereeRound(candidate.round).kind;
      return !finished(candidate) && !["group", "unknown"].includes(kind) && participants(candidate).some(knownTeam);
    });
    for (const candidate of future.reverse()) {
      const suggestions = recommend(participants(candidate), `Feststehendes Team aus später Begegnung · Spiel ${candidate.number}`);
      if (suggestions.length) return suggestions;
    }
    return [];
  }
  if (!previous || ["unknown", "group", "final", "semi"].includes(previousRound.kind)) return [];
  if (doubleKo) {
    // Semifinals are supplied by the losers of the preceding loser-tree matches.
    if (round.kind === "semi" && previousRound.kind !== "loser") return [];
    if (!["winner", "loser", "knockout"].includes(previousRound.kind)) return [];
    // Bare W identifies the tree but cannot distinguish the first-round exception.
    if (previousRound.kind === "winner" && previousRound.stage === undefined) return [];
    const loser = previousRound.kind === "loser" || previousRound.kind === "winner" && previousRound.stage === 1
      || previousRound.kind === "knockout" && previousRound.stage === openingKnockoutStage;
    return recommend([outcome(previous, loser)], `${loser ? "Verlierer" : "Sieger"} von Spiel ${previous.number} · gleicher Court`);
  }
  if (previousRound.kind !== "knockout") return [];
  return recommend([outcome(previous, true)], `Verlierer von Spiel ${previous.number} · gleicher Court`);
}

export function refereeOptionGroups(game: Game, games: Game[], options: string[]) {
  const suggested = refereeSuggestions(game, games);
  const values = [...new Set([...options, ...(game.referee && !game.referee.startsWith("__") ? [game.referee] : [])])];
  return { suggested, remaining: values.filter(value => !suggested.some(item => item.team === value)) };
}
