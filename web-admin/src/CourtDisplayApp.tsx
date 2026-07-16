import React, { useEffect, useState } from "react";
import { getTournament, listGames } from "./dataApi";
import { draftFromGame, isPlausibleSetResult, parsePointHistory, parseScore, parseTimeoutHistory, resultFromCompletedSetScores, scoreForSet } from "./scoreLogic";
import type { Game, GameDraft, Tournament } from "./types";
import type { TeamKey } from "./workflowTypes";
import { QrCode } from "./QrCode";

type GroupStanding = {
  team: string;
  played: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  pointsWon: number;
  pointsLost: number;
};

export function CourtDisplayApp({ court, tournamentId, mode = "courts" }: { court: string; tournamentId?: string; mode?: "courts" | "groups" }) {
  const [games, setGames] = useState<Game[]>([]);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadDisplay() {
    const [gameData, tournamentData] = await Promise.all([listGames(tournamentId), getTournament(tournamentId)]);
    setGames(gameData);
    setTournament(tournamentData);
    setLoading(false);
  }

  useEffect(() => {
    loadDisplay();
    const interval = window.setInterval(loadDisplay, 1000);
    return () => window.clearInterval(interval);
  }, [tournamentId]);

  if (loading) {
    return <main className="court-display-loading">Anzeige wird geladen...</main>;
  }

  const courts = displayCourts(tournament, games);
  const selectedCourt = Number.parseInt(court, 10);
  const sortedGames = sortGames(games);
  const openGames = sortedGames.filter((game) => !isCompleted(game));
  const completedGames = sortedGames.filter(isCompleted);

  if (mode === "groups") {
    return <GroupDisplay games={sortedGames} tournamentId={tournament?.id ?? tournamentId} />;
  }

  if (Number.isFinite(selectedCourt) && selectedCourt > 0) {
    return <SingleCourtDisplay court={selectedCourt} tournamentId={tournament?.id ?? tournamentId} games={openGames.filter((game) => courtNumber(game.court) === selectedCourt)} />;
  }

  const currentUrl = window.location.href;

  return (
    <main className="court-display-page">
      <section className="court-board" aria-label="Court Anzeige">
        {courts.map((court) => (
          <CourtPanel key={court} court={court} tournamentId={tournament?.id ?? tournamentId} games={openGames.filter((game) => courtNumber(game.court) === court).slice(0, 3)} />
        ))}
      </section>
      <aside className="display-side-panel">
        <DisplayOpenGames games={openGames} />
        <DisplayResults games={completedGames} tournamentId={tournament?.id ?? tournamentId} />
        <div className="display-side-box display-url-box">
          <DisplayGroupsSummary games={sortedGames} />
          <div className="display-qr-stack">
            <div className="display-qr-inline">
              <h2>Spielplan</h2>
              {tournament?.hvv_public_url ? <QrCode value={tournament.hvv_public_url} compact /> : <div className="display-qr-empty">Keine HVV Spielplan URL eingetragen</div>}
            </div>
            <div className="display-qr-inline">
              <h2>Diese Anzeige</h2>
              <QrCode value={currentUrl} compact />
            </div>
          </div>
        </div>
      </aside>
    </main>
  );
}

function SingleCourtDisplay({ court, tournamentId, games }: { court: number; tournamentId?: string; games: Game[] }) {
  const currentGame = games[0] ?? null;
  const result = currentGame ? liveScoreParts(currentGame) : null;
  const scoreState = currentGame ? gameScoreState(currentGame) : null;
  const status = currentGame && scoreState ? singleCourtGameStatus(currentGame, scoreState) : "";
  const started = scoreState ? hasStartedScore(scoreState) : false;
  return (
    <main className="single-court-page">
      <a className="single-court-back" href={displayUrl(tournamentId)}>Alle Courts</a>
      <header className="single-court-meta">
        <h1>Court {court}</h1>
        {currentGame && <div>{[`Spiel ${currentGame.number}`.trim(), status].filter(Boolean).join(" · ")}</div>}
      </header>
      <section className="single-court-card">
        {currentGame ? (
          <>
            <div className={started ? "single-court-match" : "single-court-match not-started"}>
              <div className="single-court-team">
                <strong>{currentGame.team_a || "Team A offen"}</strong>
                {started && <span>{result?.pointsA ?? "0"}</span>}
              </div>
              {started && <SingleCourtPointFlow game={currentGame} />}
              <div className="single-court-team">
                <strong>{currentGame.team_b || "Team B offen"}</strong>
                {started && <span>{result?.pointsB ?? "0"}</span>}
              </div>
            </div>
            {started && (
              <>
                <div className="single-court-setscore">
                  <span>Sätze</span>
                  <strong>{result?.sets ?? "0:0"}</strong>
                </div>
                <SingleCourtSetHistory game={currentGame} />
              </>
            )}
            {currentGame.referee && <div className="single-court-referee">Schiedsrichter: {currentGame.referee}</div>}
          </>
        ) : (
          <div className="single-court-empty">Kein aktuelles Spiel</div>
        )}
      </section>
    </main>
  );
}

function singleCourtGameStatus(game: Game, scoreState: ReturnType<typeof gameScoreState>) {
  if (hasStartedScore(scoreState)) {
    return "Live";
  }
  if (game.score_locked_by_device) {
    return "Schiedsgericht angemeldet";
  }
  return "Noch nicht gestartet";
}

function gameScoreState(game: Game) {
  return {
    hasPointHistory: parsePointHistory(game.point_history).length > 0,
    setScores: [
      game.set1_team_a,
      game.set1_team_b,
      game.set2_team_a,
      game.set2_team_b,
      game.set3_team_a,
      game.set3_team_b,
    ],
  };
}

function hasStartedScore(scoreState: ReturnType<typeof gameScoreState>) {
  if (scoreState.hasPointHistory) {
    return true;
  }

  return scoreState.setScores.some((score) => {
    const value = parseScore(score);
    return value !== null && value > 0;
  });
}

function SingleCourtPointFlow({ game }: { game: Game }) {
  const currentSet = currentSetNumber(game);
  const points = parsePointHistory(game.point_history)
    .filter((entry) => entry.set === currentSet)
    .slice(-18);

  if (points.length === 0) {
    return null;
  }

  return (
    <div className="single-court-point-flow" aria-label="Punkteverlauf">
      {points.length > 1 && (
        <svg
          className="point-flow-connector"
          viewBox={`0 0 100 ${points.length * 24}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polyline
            points={points.map((point, index) => `${point.team === "A" ? 25 : 75},${index * 24 + 12}`).join(" ")}
          />
        </svg>
      )}
      {points.map((point, index) => (
        <React.Fragment key={`${point.team}-${index}-${point.scoreA}-${point.scoreB}`}>
          {point.team === "A" ? (
            <>
              <span className="point-dot full left">{point.scoreA}</span>
              <span />
            </>
          ) : (
            <>
              <span />
              <span className="point-dot full right">{point.scoreB}</span>
            </>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function SingleCourtSetHistory({ game }: { game: Game }) {
  const sets = [
    [game.set1_team_a, game.set1_team_b],
    [game.set2_team_a, game.set2_team_b],
    [game.set3_team_a, game.set3_team_b],
  ]
    .map(([teamA, teamB], index) => ({ label: `Satz ${index + 1}`, teamA, teamB }))
    .filter((set) => {
      const teamA = parseScore(set.teamA);
      const teamB = parseScore(set.teamB);
      return teamA !== null && teamB !== null && isPlausibleSetResult({ A: teamA, B: teamB });
    });

  if (sets.length === 0) {
    return null;
  }

  return (
    <div className="single-court-set-history">
      {sets.map((set) => (
        <span key={set.label}>{set.label}: {set.teamA || "0"}:{set.teamB || "0"}</span>
      ))}
    </div>
  );
}

function CourtPanel({ court, tournamentId, games }: { court: number; tournamentId?: string; games: Game[] }) {
  const courtUrl = singleCourtUrl(court, tournamentId);
  return (
    <a className="display-court-section" href={courtUrl} aria-label={`Court ${court} Einzelansicht oeffnen`} title="Einzelansicht oeffnen">
      <div className="display-court-heading">
        <h2>Court {court}</h2>
        <span className="display-court-open" aria-hidden="true">↗</span>
      </div>
      {games.length === 0 ? (
        <div className="display-empty">Kein Spiel eingetragen</div>
      ) : (
        <div className="display-games">
          {[0, 1, 2].map((index) => {
            const game = games[index];
            if (!game) {
              return <div className="display-game" key={index}><div className="display-empty">Kein weiteres Spiel</div></div>;
            }
            return <DisplayGame key={game.id} game={game} position={index + 1} court={court} />;
          })}
        </div>
      )}
    </a>
  );
}

function DisplayGame({ game, position }: { game: Game; position: number; court: number }) {
  const current = position === 1;
  const live = current && Boolean(game.score_locked_by_device);
  const result = formatResultWithSets(game);
  const liveScore = liveScoreParts(game);
  const timeout = live ? activeTimeoutInfo(game) : null;
  return (
    <div className={`display-game ${current ? "current" : "next"} ${live ? "live" : ""}`}>
      {!current && (
        <div className="display-label">
          {position === 2 ? "Naechstes Spiel" : "Uebernaechstes Spiel"}
          {game.number && <span className="display-game-number-badge">Spiel Nr. {game.number}</span>}
        </div>
      )}
      {current && game.number && (
        <div className="display-current-game-number">
          <span className={live ? "display-game-number-badge live" : "display-game-number-badge"}>Spiel Nr. {game.number}</span>
        </div>
      )}
      {live ? (
        <div className="display-current-score-card">
          <DisplayCurrentTeam game={game} team="A" points={liveScore.pointsA} />
          <DisplayCurrentTeam game={game} team="B" points={liveScore.pointsB} />
          {timeout && (
            <div className="display-timeout-overlay" aria-live="polite">
              <span>Auszeit</span>
              <strong>{timeout.teamName}</strong>
              <em>{timeout.remaining}s</em>
            </div>
          )}
        </div>
      ) : current ? (
        <div className="display-teams current-teams">
          <div className="display-team-line">{game.team_a || "Team A offen"}</div>
          <div className="display-team-line">{game.team_b || "Team B offen"}</div>
        </div>
      ) : (
        <div className="display-teams">{teamLine(game)}</div>
      )}
      <div className="display-details">
        {!current && result && <span className="display-live-score">Stand: {result}</span>}
        {!live && game.referee && <span className="display-referee">Schiedsrichter: {game.referee}</span>}
      </div>
    </div>
  );
}

function DisplayCurrentTeam({ game, team, points }: { game: Game; team: TeamKey; points: string }) {
  const teamName = team === "A" ? game.team_a : game.team_b;
  const players = displayPlayersForTeam(teamName, team === "A" ? game.team_a_players : game.team_b_players);
  const previousSetNumbers = completedPreviousSetNumbers(game);
  return (
    <div className="display-current-team">
      <span className="display-current-players">
        {players.map((player) => <i key={player}>{player}</i>)}
      </span>
      <span className="display-current-previous-sets">
        {previousSetNumbers.map((setNumber) => (
          <em key={setNumber} className={setPointClass(game, setNumber, team)}>
            <span>{scoreForSet(draftFromGame(game), setNumber)[team] || "-"}</span>
          </em>
        ))}
      </span>
      <b>{points}</b>
    </div>
  );
}

function activeTimeoutInfo(game: Game) {
  const timeout = parseTimeoutHistory(game.point_history).at(-1);
  if (!timeout) {
    return null;
  }
  const elapsedSeconds = Math.floor((Date.now() - Date.parse(timeout.startedAt)) / 1000);
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds > 30) {
    return null;
  }
  const teamName = timeout.team === "A" ? game.team_a || "Team A" : game.team_b || "Team B";
  return {
    teamName: shortTeamLabel(teamName, teamName),
    remaining: Math.max(0, 30 - elapsedSeconds),
  };
}

function completedPreviousSetNumbers(game: Game): Array<1 | 2> {
  return ([1, 2] as const).filter((setNumber) => {
    const score = scoreForSet(draftFromGame(game), setNumber);
    return isPlausibleSetResult(score);
  });
}

function displayPlayersForTeam(teamName: string | null, players?: string[]) {
  if (players && players.length >= 2) {
    return players.slice(0, 2);
  }
  const names = (teamName || "Team offen")
    .replace(/\s*\(\d+\)\s*$/, "")
    .split(/\s+-\s+/)
    .map((name) => name.trim())
    .filter(Boolean);
  return names.length > 0 ? names.slice(0, 2) : ["Team offen"];
}

function DisplayOpenGames({ games }: { games: Game[] }) {
  return (
    <section className="display-side-box">
      <h2>Offene Spiele</h2>
      {games.length === 0 ? (
        <div className="display-side-list"><div className="display-side-item">Keine offenen Spiele</div></div>
      ) : (
        <div className="display-open-list">
          <div className="display-open-header">Nr.</div>
          <div className="display-open-header">Court</div>
          <div className="display-open-header">Spiel</div>
          {games.map((game) => (
            <React.Fragment key={game.id}>
              <div className="display-open-cell">{game.number}</div>
              <div className="display-open-cell">{game.court}</div>
              <div className="display-open-cell">{teamLine(game)}</div>
            </React.Fragment>
          ))}
        </div>
      )}
    </section>
  );
}

function DisplayResults({ games, tournamentId }: { games: Game[]; tournamentId?: string }) {
  return (
    <section className="display-side-box">
      <div className="display-side-title">
        <h2>Ergebnisse</h2>
        <a href={groupDisplayUrl(tournamentId)}>Gruppen</a>
      </div>
      {games.length === 0 ? (
        <div className="display-side-list"><div className="display-side-item">Noch keine Ergebnisse</div></div>
      ) : (
        <div className="display-side-list">
          {games.map((game) => (
            <div className="display-side-item" key={game.id}>
              {game.number && `Nr. ${game.number} `}
              <ResultTeam game={game} team="a" /> vs. <ResultTeam game={game} team="b" />
              {formatResultWithSets(game) && <span className="display-result-score"> {formatResultWithSets(game)}</span>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function GroupDisplay({ games, tournamentId }: { games: Game[]; tournamentId?: string }) {
  const grouped = groupStandings(games);
  return (
    <main className="group-display-page">
      <a className="single-court-back" href={displayUrl(tournamentId)}>Courts anzeigen</a>
      <header className="group-display-header">
        <h1>Gruppen</h1>
        <span>{grouped.length === 0 ? "Keine Gruppenergebnisse" : `${grouped.length} Gruppen`}</span>
      </header>
      {grouped.length === 0 ? (
        <section className="group-display-empty">Noch keine Spiele mit Gruppe A, B, C oder D.</section>
      ) : (
        <section className="group-table-grid" aria-label="Gruppentabellen">
          {grouped.map(({ group, standings }) => (
            <article className="group-table-card" key={group}>
              <h2>Gruppe {group}</h2>
              <div className="group-table-wrap">
                <table className="group-table">
                  <thead>
                    <tr>
                      <th>Rang</th>
                      <th>Team</th>
                      <th>Pkt</th>
                      <th>Sätze</th>
                      <th>Bälle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((row, index) => (
                      <tr key={row.team}>
                        <td data-label="Rang">{index + 1}</td>
                        <td data-label="Team">{row.team}</td>
                        <td data-label="Pkt">{rankingPoints(row)}</td>
                        <td data-label="Sätze">{row.setsWon}:{row.setsLost}</td>
                        <td data-label="Bälle">{row.pointsWon}:{row.pointsLost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

function DisplayGroupsSummary({ games }: { games: Game[] }) {
  const grouped = groupStandings(games);
  return (
    <section className="display-groups-summary" aria-label="Gruppentabellen">
      <h2>Gruppen</h2>
      {grouped.length === 0 ? (
        <div className="display-groups-empty">Noch keine Gruppenergebnisse</div>
      ) : (
        <div className="display-groups-list">
          {grouped.map(({ group, standings }) => (
            <article className="display-group-card" key={group}>
              <h3>Gruppe {group}</h3>
              <table className="display-group-table">
                <thead>
                  <tr>
                    <th>R</th>
                    <th>Team</th>
                    <th>Pkt</th>
                    <th>S</th>
                    <th>B</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((row, index) => (
                    <tr key={row.team}>
                      <td>{index + 1}</td>
                      <td>{row.team}</td>
                      <td>{rankingPoints(row)}</td>
                      <td>{row.setsWon}:{row.setsLost}</td>
                      <td>{row.pointsWon}:{row.pointsLost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ResultTeam({ game, team }: { game: Game; team: "a" | "b" }) {
  const winner = winnerIndex(game) === (team === "a" ? 1 : 2);
  const label = team === "a" ? game.team_a || "Team A offen" : game.team_b || "Team B offen";
  return winner ? <strong className="display-winner">{label}</strong> : <span>{label}</span>;
}


function displayUrl(tournamentId?: string) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("view", "courts");
  if (tournamentId) {
    url.searchParams.set("tournamentId", tournamentId);
  }
  return url.toString();
}

function singleCourtUrl(court: number, tournamentId?: string) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("view", "courts");
  url.searchParams.set("court", String(court));
  if (tournamentId) {
    url.searchParams.set("tournamentId", tournamentId);
  }
  return url.toString();
}

function groupDisplayUrl(tournamentId?: string) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("view", "groups");
  if (tournamentId) {
    url.searchParams.set("tournamentId", tournamentId);
  }
  return url.toString();
}

function displayCourts(tournament: Tournament | null, games: Game[] = []) {
  const configured = tournament?.courts
    .map((court) => courtNumber(court))
    .filter((court) => court > 0);
  const gameCourts = games
    .map((game) => courtNumber(game.court))
    .filter((court) => court > 0);
  const courts = [...new Set([...(configured ?? []), ...gameCourts])];
  if (courts.length === 0) {
    return [1, 2, 3, 4];
  }
  return courts.sort((left, right) => left - right);
}

function sortGames(games: Game[]) {
  return [...games].sort((left, right) => gameNumberSortKey(left.number) - gameNumberSortKey(right.number) || left.number.localeCompare(right.number, "de"));
}

function groupStandings(games: Game[]) {
  const grouped = new Map<string, Game[]>();
  for (const game of games) {
    const group = groupLabel(game.round);
    if (!group) {
      continue;
    }
    grouped.set(group, [...(grouped.get(group) ?? []), game]);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "de", { numeric: true }))
    .map(([group, groupGames]) => ({
      group,
      standings: rankGroupTeams(groupGames),
    }));
}

function rankGroupTeams(games: Game[]) {
  const standings = new Map<string, GroupStanding>();
  for (const game of games) {
    const teamA = groupTeamName(game.team_a);
    const teamB = groupTeamName(game.team_b);
    if (!teamA || !teamB) {
      continue;
    }
    const rowA = ensureStanding(standings, teamA);
    const rowB = ensureStanding(standings, teamB);
    if (!isCompleted(game)) {
      continue;
    }
    rowA.played += 1;
    rowB.played += 1;

    const winner = completedWinnerSide(game);
    if (winner === "A") {
      rowA.wins += 1;
      rowB.losses += 1;
    } else if (winner === "B") {
      rowB.wins += 1;
      rowA.losses += 1;
    }

    for (const [scoreA, scoreB] of completedSetScores(game)) {
      rowA.pointsWon += scoreA;
      rowA.pointsLost += scoreB;
      rowB.pointsWon += scoreB;
      rowB.pointsLost += scoreA;
      if (scoreA > scoreB) {
        rowA.setsWon += 1;
        rowB.setsLost += 1;
      } else if (scoreB > scoreA) {
        rowB.setsWon += 1;
        rowA.setsLost += 1;
      }
    }
  }

  const ranked = [...standings.values()].sort((left, right) =>
    rankingPoints(right) - rankingPoints(left)
    || setRatio(right) - setRatio(left)
    || ballRatio(right) - ballRatio(left)
  );
  return applyTwoTeamHeadToHeadTies(ranked, games);
}

function ensureStanding(standings: Map<string, GroupStanding>, team: string) {
  const existing = standings.get(team);
  if (existing) {
    return existing;
  }
  const created = {
    team,
    played: 0,
    wins: 0,
    losses: 0,
    setsWon: 0,
    setsLost: 0,
    pointsWon: 0,
    pointsLost: 0,
  };
  standings.set(team, created);
  return created;
}

function completedSetScores(game: Game) {
  return [
    [game.set1_team_a, game.set1_team_b],
    [game.set2_team_a, game.set2_team_b],
    [game.set3_team_a, game.set3_team_b],
  ].flatMap(([teamA, teamB]) => {
    const scoreA = parseScore(teamA);
    const scoreB = parseScore(teamB);
    return scoreA !== null && scoreB !== null && isPlausibleSetResult({ A: scoreA, B: scoreB })
      ? [[scoreA, scoreB] as const]
      : [];
  });
}

function applyTwoTeamHeadToHeadTies(standings: GroupStanding[], games: Game[]) {
  const ranked: GroupStanding[] = [];
  for (let index = 0; index < standings.length;) {
    const tied = standings.slice(index).filter((row) => sameRankingMetrics(row, standings[index]));
    if (tied.length === 2) {
      ranked.push(...sortTwoTeamHeadToHead(tied[0], tied[1], games));
    } else {
      ranked.push(...tied.sort((left, right) => left.team.localeCompare(right.team, "de", { numeric: true })));
    }
    index += tied.length;
  }
  return ranked;
}

function sameRankingMetrics(left: GroupStanding, right: GroupStanding) {
  return rankingPoints(left) === rankingPoints(right)
    && setRatio(left) === setRatio(right)
    && ballRatio(left) === ballRatio(right);
}

function sortTwoTeamHeadToHead(left: GroupStanding, right: GroupStanding, games: Game[]) {
  const game = games.find((candidate) =>
    (groupTeamName(candidate.team_a) === left.team && groupTeamName(candidate.team_b) === right.team)
    || (groupTeamName(candidate.team_a) === right.team && groupTeamName(candidate.team_b) === left.team)
  );
  const winner = game ? completedWinnerSide(game) : "";
  if (winner === "A") {
    return groupTeamName(game?.team_a) === left.team ? [left, right] : [right, left];
  }
  if (winner === "B") {
    return groupTeamName(game?.team_b) === left.team ? [left, right] : [right, left];
  }
  return [left, right].sort((teamLeft, teamRight) => teamLeft.team.localeCompare(teamRight.team, "de", { numeric: true }));
}

function groupLabel(round: string | null | undefined) {
  const normalized = (round ?? "").trim().toUpperCase();
  return /^[A-D]$/.test(normalized) ? normalized : "";
}

function groupTeamName(team: string | null | undefined) {
  const normalized = (team ?? "").trim();
  return normalized && normalized !== "(Freilos)" ? normalized : "";
}

function rankingPoints(row: GroupStanding) {
  return row.wins * 2;
}

function setRatio(row: GroupStanding) {
  return ratio(row.setsWon, row.setsLost);
}

function ballRatio(row: GroupStanding) {
  return ratio(row.pointsWon, row.pointsLost);
}

function ratio(won: number, lost: number) {
  if (lost === 0) {
    return won > 0 ? Number.POSITIVE_INFINITY : 0;
  }
  return won / lost;
}

function formatRatio(value: number) {
  return Number.isFinite(value) ? value.toFixed(3) : "∞";
}

function numericCourtOptions(games: Game[], tournament: Tournament | null = null): string[] {
  const configuredCourts = tournament?.courts
    .map((court) => court.trim())
    .filter((court) => courtNumber(court) > 0) ?? [];
  const gameCourts = games
    .map((game) => courtLabel(game.court))
    .filter((court): court is string => court !== "-");
  const courts = [...new Set([...configuredCourts, ...gameCourts])];
  const sorted = courts.sort((left, right) => Number.parseInt(left, 10) - Number.parseInt(right, 10));
  return sorted.length > 0 ? sorted : ["1", "2", "3", "4"];
}

function assignmentOptions(games: Game[]): string[] {
  const values = games.flatMap((game) => [game.team_a, game.team_b, game.referee])
    .map((value) => (value ?? "").trim())
    .filter((value): value is string => Boolean(value) && value !== "(Freilos)" && !isLegacyPreviousGameReferee(value));
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "de", { numeric: true }));
}

function prioritizedRefereeOptions(game: Game, games: Game[], allOptions: string[]) {
  const current = resolvedReferee(game, games);
  const currentNumber = gameNumberSortKey(game.number);
  const sameCourtNeighbours = games
    .filter((candidate) => candidate.id !== game.id && candidate.court === game.court)
    .sort((left, right) => Math.abs(gameNumberSortKey(left.number) - currentNumber) - Math.abs(gameNumberSortKey(right.number) - currentNumber))
    .slice(0, 2);
  const suggestedValues = [current, game.referee, ...sameCourtNeighbours.flatMap((candidate) => [candidate.team_a, candidate.team_b, candidate.referee])];
  const suggested = uniqueAssignmentValues(suggestedValues)
    .filter((value) => allOptions.includes(value) && value !== game.team_a && value !== game.team_b)
    .slice(0, 5);
  const remaining = allOptions.filter((value) => !suggested.includes(value));
  return { suggested, remaining };
}

function uniqueAssignmentValues(values: Array<string | null | undefined>) {
  return [...new Set(values
    .map((value) => (value ?? "").trim())
    .filter((value): value is string => Boolean(value) && value !== "(Freilos)" && !isLegacyPreviousGameReferee(value)))];
}

function mobileGameCardClass(game: Game, saveState: "idle" | "saving" | "saved") {
  return [
    "mobile-game-card",
    `court-${courtLabel(game.court).toLowerCase()}`,
    isCompleted(game) ? "completed" : "",
    game.score_locked_by_device && !isCompleted(game) ? "locked" : "",
    game.dirty ? "dirty-row" : "",
    saveState === "saving" ? "saving" : "",
    saveState === "saved" ? "saved" : "",
  ].filter(Boolean).join(" ").replace("court--", "court-none");
}

function teamOptions(games: Game[]): string[] {
  const values = games.flatMap((game) => [game.team_a, game.team_b])
    .map((value) => (value ?? "").trim())
    .filter((value): value is string => Boolean(value) && value !== "(Freilos)");
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "de", { numeric: true }));
}

function resolvedReferee(game: Game, games: Game[]) {
  const referee = game.referee ?? "";
  return isLegacyPreviousGameReferee(referee) ? "" : referee;
}

function isLegacyPreviousGameReferee(value: string) {
  return value === "__previous_winner__" || value === "__previous_loser__";
}

function gameNumberSortKey(number: string | null) {
  const match = (number ?? "").match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : Number.MAX_SAFE_INTEGER;
}

function courtNumber(court: string | null) {
  const normalized = (court ?? "").trim();
  return /^\d+$/.test(normalized) ? Number.parseInt(normalized, 10) : -1;
}

function isAssignedCourt(court: string | null | undefined) {
  return courtNumber(court ?? null) > 0;
}

function courtLabel(court: string | null | undefined) {
  return isAssignedCourt(court) ? (court ?? "").trim() : "-";
}

function isCompleted(game: Game) {
  return Boolean(game.completed || isSpecialRating(game.game_rating));
}

function isCompletedDraft(draft: GameDraft) {
  return Boolean(draft.completed || isSpecialRating(draft.game_rating));
}

function isSpecialRating(rating: string | null) {
  const normalized = (rating ?? "").trim();
  return Boolean(normalized && normalized !== "Normal");
}

function lastCompletedSetNumber(draft: GameDraft): 1 | 2 | 3 | null {
  const sets = [
    [1, draft.set1_team_a, draft.set1_team_b],
    [2, draft.set2_team_a, draft.set2_team_b],
    [3, draft.set3_team_a, draft.set3_team_b],
  ] as const;

  for (const [setNumber, teamA, teamB] of sets.slice().reverse()) {
    const scoreA = parseScore(teamA);
    const scoreB = parseScore(teamB);
    if (scoreA !== null && scoreB !== null && scoreA !== scoreB) {
      return setNumber;
    }
  }
  return null;
}

function confirmationText(draft: GameDraft) {
  const rating = draft.game_rating || "Normal";
  const winner = draft.winner_team || "nicht eindeutig";
  return rating === "Normal"
    ? `Spiel abschließen?\nSiegerteam: ${winner}`
    : `Spiel mit Sonderwertung abschließen?\nSpielwertung: ${rating}\nSiegerteam: ${winner}`;
}

function teamLine(game: Game) {
  return `${game.team_a || "Team A offen"} vs. ${game.team_b || "Team B offen"}`;
}

function playersForTeam(team: string | null, players?: string[]) {
  if (players && players.length >= 2) {
    return players.slice(0, 2);
  }
  const teamName = team || "Team";
  return [`${teamName} Spieler 1`, `${teamName} Spieler 2`];
}

function formatSetScores(game: Game) {
  return [
    [game.set1_team_a, game.set1_team_b],
    [game.set2_team_a, game.set2_team_b],
    [game.set3_team_a, game.set3_team_b],
  ]
    .filter(([teamA, teamB]) => teamA || teamB)
    .map(([teamA, teamB]) => `${teamA ?? ""}:${teamB ?? ""}`)
    .join(",");
}

function formatResultWithSets(game: Game) {
  const result = resultFromCompletedSetScores(game) || game.result?.trim() || "";
  const setScores = formatSetScores(game);
  if (result && setScores) {
    return `${result} (${setScores})`;
  }
  if (result) {
    return result;
  }
  if (setScores) {
    return `(${setScores})`;
  }
  return "";
}

function completedWinnerSide(game: Game): TeamKey | "" {
  if (game.winner_team === game.team_a || game.winner_team === "1") {
    return "A";
  }
  if (game.winner_team === game.team_b || game.winner_team === "2") {
    return "B";
  }
  const index = winnerIndexFromScores(game);
  return index === 1 ? "A" : index === 2 ? "B" : "";
}

function completedResultParts(game: Game) {
  const result = resultFromCompletedSetScores(game) || game.result?.trim() || "";
  const match = result.match(/(\d+)\s*[:-]\s*(\d+)/);
  return {
    teamA: match?.[1] ?? "-",
    teamB: match?.[2] ?? "-",
  };
}

function setPointClass(game: Game, setNumber: 1 | 2 | 3, team: TeamKey) {
  const score = scoreForSet(draftFromGame(game), setNumber);
  if (score.A === score.B) {
    return "";
  }
  return score[team] > score[team === "A" ? "B" : "A"] ? "set-winner" : "";
}

function winnerIndexFromScores(game: Game) {
  const computed = resultFromCompletedSetScores(game);
  const source = computed || game.result || "";
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

function liveScoreParts(game: Game) {
  const setPairs = [
    [game.set1_team_a, game.set1_team_b],
    [game.set2_team_a, game.set2_team_b],
    [game.set3_team_a, game.set3_team_b],
  ];
  const sets = resultFromCompletedSetScores(game) || "0:0";
  const current = [...setPairs].reverse().find(([teamA, teamB]) => {
    const scoreA = parseScore(teamA);
    const scoreB = parseScore(teamB);
    if (scoreA === null && scoreB === null) {
      return false;
    }
    if (scoreA !== null && scoreB !== null && isPlausibleSetResult({ A: scoreA, B: scoreB })) {
      return false;
    }
    return true;
  }) ?? ["0", "0"];
  return {
    sets,
    pointsA: current[0] || "0",
    pointsB: current[1] || "0",
  };
}

function currentSetNumber(game: Game): 1 | 2 | 3 {
  if (game.set3_team_a || game.set3_team_b) {
    return 3;
  }
  if (game.set2_team_a || game.set2_team_b) {
    return 2;
  }
  return 1;
}

function shortTeamLabel(value: string | null | undefined, fallback: string) {
  const label = value?.replace(/\s*\(\d+\)\s*$/, "").trim() || fallback;
  return label.replace(/\s+-\s+/g, " / ");
}

function winnerIndex(game: Game) {
  if (game.winner_team) {
    if (game.winner_team === game.team_a || game.winner_team === "1") {
      return 1;
    }
    if (game.winner_team === game.team_b || game.winner_team === "2") {
      return 2;
    }
  }

  const result = game.result ?? "";
  const match = result.match(/(\d+)\s*[:-]\s*(\d+)/);
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
