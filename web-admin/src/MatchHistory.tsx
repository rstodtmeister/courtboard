import React from 'react';
import { matchHistory } from './matchHistoryData';
import { resolveTeam } from './teamCompanionLogic';
import type { Game } from './types';
import { PointFlow } from './PointFlow';

export function MatchHistory({ game, games, team }: { game: Game; games: Game[]; team: string }) {
  const sets = matchHistory(game.point_history);
  if (!sets.length) return null;
  const ownA = resolveTeam(game.team_a, games) === team;
  const opponent = resolveTeam(ownA ? game.team_b : game.team_a, games) || 'Gegner';
  const scoreForSet = (set: number) => {
    const a = game[`set${set}_team_a` as 'set1_team_a' | 'set2_team_a' | 'set3_team_a'] || '';
    const b = game[`set${set}_team_b` as 'set1_team_b' | 'set2_team_b' | 'set3_team_b'] || '';
    if (!a && !b) return '';
    return ownA ? `${a}:${b}` : `${b}:${a}`;
  };
  return <details className="companion-result-details companion-history"><summary>Spielverlauf</summary>
    <p className="companion-hint">Gespeicherte Punktentwicklung · fehlende Abschnitte werden nicht ergänzt.</p>
    {sets.map(set => {
      const own=(p:{scoreA:number;scoreB:number})=>ownA?p.scoreA:p.scoreB;
      const other=(p:{scoreA:number;scoreB:number})=>ownA?p.scoreB:p.scoreA;
      const last=set.points.at(-1);
      return <section key={set.set} className="history-set"><h3><span>Satz {set.set}</span>{last && <strong>{scoreForSet(set.set) || `${own(last)}:${other(last)}`}</strong>}</h3>
        {set.partial && <p className="companion-hint">Dieser Satzverlauf ist nur teilweise gespeichert.</p>}
        <div className="history-flow-labels"><span title={team}>{team}</span><span title={opponent}>{opponent}</span></div>
        <PointFlow points={set.points} markers={set.timeouts.map(timeout=>({...timeout,label:'Auszeit'}))} reverse={!ownA} className="history-point-flow" />
        {set.timeouts.some(timeout=>!set.points.some(point=>point.scoreA===timeout.scoreA&&point.scoreB===timeout.scoreB)) && <ul className="history-timeouts">{set.timeouts.filter(timeout=>!set.points.some(point=>point.scoreA===timeout.scoreA&&point.scoreB===timeout.scoreB)).map((p,i)=><li key={i}>Auszeit {(p.team==='A')===ownA?'eures Teams':'Gegner'} bei {own(p)}:{other(p)}</li>)}</ul>}
      </section>;
    })}
  </details>;
}
