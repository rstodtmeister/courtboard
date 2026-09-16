import React from 'react';
import { youtubeReplay } from './youtubeReplay';
import { MatchHistory } from './MatchHistory';
import { MyTeam, useMyTeam } from './MyTeam';
import { resolveTeam, teamCompanion, teamViewUrl, teamResult } from './teamCompanionLogic';
import type { Game, Tournament } from './types';

export function TeamCompanion({ games, tournament, error }: { games: Game[]; tournament: Tournament; error: string }) {
  return <main className="team-companion">
    <header className="companion-header"><div><p>{tournament.name}</p><h1>Dein Turnierbegleiter</h1></div>
      <a className="companion-link" href={teamViewUrl('courts', tournament.id)}>← Alle Courts</a></header>
    {error && <p className="companion-notice" role="status">{error} Die angezeigten Daten können veraltet sein.</p>}
    <MyTeam key={tournament.id} tournamentId={tournament.id} games={games} companion>
      <TeamAgenda games={games} />
    </MyTeam>
  </main>;
}

function TeamAgenda({ games }: { games: Game[] }) {
  const team = useMyTeam();
  const { duties, results } = teamCompanion(games, team);
  if (!team) return <section className="companion-empty"><h2>Welches Team seid ihr?</h2><p>Wählt oben euer Team. Hier findet ihr eure Spiele, Schiedsgerichtseinsätze und Ergebnisse.</p></section>;
  const seen = new Set<string>();
  const next = duties.filter(duty => {
    const key = `${duty.court}-${duty.role}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const later = duties.filter(duty => !next.includes(duty));
  function card({ game, role, ahead, court, preceding }: typeof duties[number]) {
    const a = resolveTeam(game.team_a, games) || 'Team noch offen';
    const b = resolveTeam(game.team_b, games) || 'Team noch offen';
    return <article className="companion-duty" key={`${game.id}-${role}`}>
      <div className="companion-duty-top"><strong>{role === 'play' ? 'Euer Spiel' : 'Schiedsgericht'} – Spiel {game.number}{game.round ? ` · ${game.round}` : ''}</strong>
        <span className="companion-court-label">{court ? `Court ${court}` : 'Court offen'}</span>
      </div>
      <p className="companion-match">{role === 'play' ? `Gegen ${a === team ? b : a}` : `${a} gegen ${b}`}</p>
      {ahead !== null && ahead > 0 ? <details className="companion-preceding">
        <summary className="companion-count">Noch {ahead} {ahead === 1 ? 'Spiel' : 'Spiele'} vor euch</summary>
        <ol>{preceding.map(prior => <li key={prior.id}>
          <strong>Spiel {prior.number}{prior.round ? ` · ${prior.round}` : ''}{prior.display_state?.hasPoints ? ' · Läuft gerade' : ''}</strong>
          <span>{resolveTeam(prior.team_a, games) || 'Team noch offen'} gegen {resolveTeam(prior.team_b, games) || 'Team noch offen'}</span>
        </li>)}</ol>
      </details> : <p className="companion-count companion-current">{ahead === null ? 'Reihenfolge offen' : `${game.display_state?.hasPoints ? 'Läuft gerade' : 'Jetzt am Court'}: Spiel ${game.number}`}</p>}

    </article>;
  }
  return <>
    <section aria-labelledby="companion-duties"><h2 id="companion-duties">Als Nächstes</h2>
      {duties.length === 0 && <p className="companion-empty">Aktuell kein weiterer Einsatz zugeordnet. Weitere KO-Begegnungen können noch offen sein.</p>}
      <div className="companion-courts">{next.map(card)}</div>
      {next.length > 0 && <p className="companion-hint">Je Court · laufende Spiele zählen mit.</p>}
    </section>
    {later.length > 0 && <details className="companion-details"><summary>Weitere Aufgaben ({later.length})</summary><div className="companion-courts">{later.map(card)}</div></details>}
    <details className="companion-details companion-results"><summary>Eure Ergebnisse ({results.length})</summary>
      {results.length === 0 ? <p>Noch keine abgeschlossenen Spiele.</p> : results.map(game => {
        const result = teamResult(game, team, games);
        const replay = youtubeReplay(game);
        return <article key={game.id} className="companion-result">
          <div className="companion-result-heading"><strong className={result.status === 'Sieg' ? 'result-win' : result.status === 'Niederlage' ? 'result-loss' : ''}>{result.status}</strong><span>Spiel {game.number}{game.round ? ` · ${game.round}` : ''}</span></div>
          <p>Gegen {result.opponent || 'Team noch offen'}</p>
          <div className="companion-result-score"><strong>{result.total || 'Ergebnis nicht verfügbar'}</strong>
            {result.sets.length > 0 && <span aria-label="Satzergebnisse aus eurer Sicht">{result.sets.map(set => <span key={set.number} title={`Satz ${set.number}`}>{set.own}:{set.opponent}</span>)}</span>}
          </div>
          {result.rating && <p className="companion-hint">Sonderwertung: {result.rating}</p>}
          {replay && <a className="companion-replay" href={replay.url} target="_blank" rel="noreferrer">▶ Spiel auf YouTube ansehen</a>}
          <MatchHistory game={game} games={games} team={team} />
        </article>;
      })}
    </details>
  </>;
}
