import type { Game } from './types';

export const completedGame = (game: Game) => Boolean(game.completed || (game.game_rating?.trim() && game.game_rating.trim() !== 'Normal'));
const order = (game: Game) => game.display_order ?? Number(game.number.match(/\d+/)?.[0] ?? Number.MAX_SAFE_INTEGER);
export const compareCourtGames = (a: Game, b: Game) => order(a) - order(b) || a.number.localeCompare(b.number, 'de', { numeric: true });

// Resolve only confirmed results, including chains of bracket references.
export function resolveTeam(value: string | null, games: Game[], seen = new Set<string>()): string {
  const name = (value ?? '').trim();
  const reference = name.match(/^(Gewinner|Sieger|Verlierer|Winner|Loser)\s+(?:(?:aus|von|des)\s+)?(?:Spiel|Match)\s*#?\s*(\d+)$/i);
  if (!reference) return name;
  const matches = games.filter(game => game.number.trim() === reference[2]);
  const source = matches.length === 1 ? matches[0] : undefined;
  if (!source || !completedGame(source) || seen.has(source.id)) return name;
  const visited = new Set([...seen, source.id]);
  const a = resolveTeam(source.team_a, games, visited), b = resolveTeam(source.team_b, games, visited);
  const winner = source.winner_team?.trim();
  let side = winner && (winner === a || winner === source.team_a || winner === '1') ? 0
    : winner && (winner === b || winner === source.team_b || winner === '2') ? 1 : -1;
  if (side < 0) {
    const result = source.result?.match(/^\s*(\d+)\s*:\s*(\d+)\s*$/);
    if (result && result[1] !== result[2]) side = Number(result[1]) > Number(result[2]) ? 0 : 1;
  }
  if (side < 0) return name;
  return [a, b][/^(Verlierer|Loser)$/i.test(reference[1]) ? 1 - side : side];
}

export function teamCompanion(games: Game[], team: string) {
  const involved = (game: Game) => Boolean(team && [game.team_a, game.team_b].some(value => resolveTeam(value, games) === team));
  const duties = games.filter(game => !completedGame(game)).flatMap(game => {
    const roles: Array<'play' | 'referee'> = [];
    if (involved(game)) roles.push('play');
    if (team && resolveTeam(game.referee, games) === team) roles.push('referee');
    const court = (game.court ?? '').trim();
    const assigned = Boolean(court && court !== '-' && court !== '0' && !court.startsWith('-'));
    const queue = assigned ? games.filter(item => !completedGame(item) && item.court?.trim() === court).sort(compareCourtGames) : [];
    const ahead = assigned ? queue.findIndex(item => item.id === game.id) : null;
    const preceding = ahead === null ? [] : queue.slice(0, ahead);
    return roles.map(role => ({ game, role, court: assigned ? court : '', ahead, preceding }));
  });
  duties.sort((a, b) => a.court.localeCompare(b.court, 'de', { numeric: true }) || compareCourtGames(a.game, b.game));
  return { duties, results: games.filter(game => completedGame(game) && involved(game)).sort((a,b) => b.number.localeCompare(a.number, 'de', { numeric: true })) };
}

export function teamViewUrl(view: 'team' | 'courts', tournamentId: string, team = '', court = '') {
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set('view', view);
  url.searchParams.set('tournamentId', tournamentId);
  if (team) url.searchParams.set('team', team);
  if (court) url.searchParams.set('court', court);
  return url.href;
}

export function teamResult(game: Game, team: string, games: Game[]) {
  const a = resolveTeam(game.team_a, games), b = resolveTeam(game.team_b, games);
  const side = team === a ? 0 : 1;
  const result = game.result?.match(/^\s*(\d+)\s*:\s*(\d+)\s*$/);
  const totals = result ? [Number(result[1]), Number(result[2])] : null;
  const winner = game.winner_team?.trim();
  let winnerSide = winner && [a, game.team_a, '1'].includes(winner) ? 0
    : winner && [b, game.team_b, '2'].includes(winner) ? 1 : -1;
  if (winnerSide < 0 && totals && totals[0] !== totals[1]) winnerSide = totals[0] > totals[1] ? 0 : 1;
  const status = winnerSide < 0 ? 'Abgeschlossen' : winnerSide === side ? 'Sieg' : 'Niederlage';
  const sets = [
    [game.set1_team_a, game.set1_team_b],
    [game.set2_team_a, game.set2_team_b],
    [game.set3_team_a, game.set3_team_b],
  ].flatMap((points, index) => {
    if (!points.every(value => value != null && /^\d+$/.test(value.trim())) || points.every(value => Number(value) === 0)) return [];
    return [{ number: index + 1, own: Number(points[side]), opponent: Number(points[1 - side]) }];
  });
  return { status, opponent: side === 0 ? b : a, total: totals ? `${totals[side]}:${totals[1-side]}` : null, sets,
    rating: game.game_rating?.trim() && game.game_rating.trim() !== 'Normal' ? game.game_rating.trim() : null };
}
