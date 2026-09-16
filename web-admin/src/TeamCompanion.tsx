import React from 'react';
import { MyTeam, useMyTeam } from './MyTeam';
import { resolveTeam, teamCompanion, teamViewUrl } from './teamCompanionLogic';
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
  function card({ game, role, ahead, court }: typeof duties[number]) {
    const a = resolveTeam(game.team_a, games) || 'Team noch offen';
    const b = resolveTeam(game.team_b, games) || 'Team noch offen';
    return <article className="companion-duty" key={`${game.id}-${role}`}>
      <div className="companion-duty-top"><strong>{role === 'play' ? 'Euer Spiel' : 'Schiedsgericht'} – Spiel {game.number}</strong>
        <span className="companion-court-label">{court ? `Court ${court}` : 'Court offen'}</span>
      </div>
      <p className="companion-match">{role === 'play' ? `Gegen ${a === team ? b : a}` : `${a} gegen ${b}`}</p>
      <div className="companion-duty-bottom"><span className="companion-count">{ahead === null ? 'Reihenfolge offen' : ahead === 0 ? (game.display_state?.hasPoints ? 'Läuft gerade' : 'Jetzt am Court') : `Noch ${ahead} ${ahead === 1 ? 'Spiel' : 'Spiele'} vor euch`}</span>
        {game.round && <small>{game.round}</small>}</div>
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
      {results.length === 0 ? <p>Noch keine abgeschlossenen Spiele.</p> : results.map(game => <article key={game.id}><span>Spiel {game.number} · Court {game.court || 'offen'}</span><p>{resolveTeam(game.team_a, games)} gegen {resolveTeam(game.team_b, games)}</p><strong>{game.result || game.game_rating || 'Abgeschlossen'}</strong></article>)}
    </details>
  </>;
}
