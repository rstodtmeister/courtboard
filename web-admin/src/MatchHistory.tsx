import React from 'react';
import { matchHistory } from './matchHistoryData';
import { resolveTeam } from './teamCompanionLogic';
import type { Game } from './types';
import { PointFlow } from './PointFlow';

export function MatchHistory({ game, games, team }: { game: Game; games: Game[]; team: string }) {
  const sets = matchHistory(game.point_history);
  if (!sets.length) return null;
  const ownA = resolveTeam(game.team_a, games) === team;
  return <details className="companion-result-details companion-history"><summary>Spielverlauf</summary>
    <p className="companion-hint">Gespeicherte Punktentwicklung · fehlende Abschnitte werden nicht ergänzt.</p>
    {sets.map(set => {
      const own=(p:{scoreA:number;scoreB:number})=>ownA?p.scoreA:p.scoreB;
      const other=(p:{scoreA:number;scoreB:number})=>ownA?p.scoreB:p.scoreA;
      const last=set.points.at(-1);
      return <section key={set.set} className="history-set"><h3><span>Satz {set.set}</span>{last && <strong>{own(last)}:{other(last)}</strong>}</h3>
        {set.partial && <p className="companion-hint">Dieser Satzverlauf ist nur teilweise gespeichert.</p>}
        <div className="history-flow-labels"><span>Euer Team</span><span>Gegner</span></div>
        <PointFlow points={set.points} reverse={!ownA} className="history-point-flow" />
        {set.timeouts.length>0 && <ul className="history-timeouts">{set.timeouts.map((p,i)=><li key={i}>Auszeit {(p.team==='A')===ownA?'eures Teams':'Gegner'} bei {own(p)}:{other(p)}</li>)}</ul>}
      </section>;
    })}
  </details>;
}
