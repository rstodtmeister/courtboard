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
      <TeamAgenda games={games} tournamentId={tournament.id} />
    </MyTeam>
  </main>;
}

function TeamAgenda({ games, tournamentId }: { games: Game[]; tournamentId: string }) {
  const team = useMyTeam();
  const { duties, results } = teamCompanion(games, team);
  if (!team) return <section className="companion-empty"><h2>Welches Team seid ihr?</h2><p>Wählt oben euer Team. Hier findet ihr eure Spiele, Schiedsgerichtseinsätze und Ergebnisse.</p></section>;
  const courts = [...new Set(duties.map(duty => duty.court))];
  return <>
    <section className="companion-team"><div><p>Mein Team</p><h2>{team}</h2></div></section>
    <section aria-labelledby="companion-duties"><h2 id="companion-duties">Eure nächsten Aufgaben</h2>
      <p className="companion-hint">Die Reihenfolge gilt je Court. Laufende Spiele zählen bei „Spiele vor euch“ mit. Einsätze erscheinen erst, wenn ihr zugewiesen seid.</p>
      {duties.length === 0 && <p className="companion-empty">Aktuell ist kein weiterer Einsatz für euch fest zugeordnet. Weitere KO-Begegnungen können noch offen sein.</p>}
      <div className="companion-courts">{courts.map(court => <section className="companion-court" key={court}>
        <h3>{court ? `Court ${court}` : 'Court noch offen'}</h3>
        {duties.filter(duty => duty.court === court).map(({ game, role, ahead }, index) => <article className={`companion-duty ${index === 0 ? 'companion-next' : ''}`} key={`${game.id}-${role}`}>
          <div className="companion-duty-top"><strong>{role === 'play' ? 'Euer Spiel' : 'Schiedsgericht'}</strong><span>Spiel {game.number} {game.round ? `· ${game.round}` : ''}</span></div>
          <p className="companion-match">{resolveTeam(game.team_a, games) || 'Team noch offen'}<span>gegen</span>{resolveTeam(game.team_b, games) || 'Team noch offen'}</p>
          <p className="companion-count">{ahead === null ? 'Reihenfolge noch offen' : ahead === 0 ? (game.display_state?.hasPoints ? 'Läuft gerade' : 'Als Nächstes auf diesem Court') : `Noch ${ahead} ${ahead === 1 ? 'Spiel' : 'Spiele'} vor euch`}</p>
          {court && <a href={teamViewUrl('courts', tournamentId, team, court)}>Court anzeigen →</a>}
        </article>)}
      </section>)}</div>
    </section>
    <section className="companion-results"><h2>Eure Ergebnisse</h2>
      {results.length === 0 ? <p>Noch keine abgeschlossenen Spiele.</p> : results.map(game => <article key={game.id}><span>Spiel {game.number} · Court {game.court || 'offen'}</span><p>{resolveTeam(game.team_a, games)} gegen {resolveTeam(game.team_b, games)}</p><strong>{game.result || game.game_rating || 'Abgeschlossen'}</strong></article>)}
    </section>
  </>;
}
