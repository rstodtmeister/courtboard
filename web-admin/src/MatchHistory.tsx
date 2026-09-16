import React from 'react';
import { matchHistory } from './matchHistoryData';
import { resolveTeam } from './teamCompanionLogic';
import type { Game } from './types';

export function MatchHistory({ game, games, team }: { game: Game; games: Game[]; team: string }) {
  const sets = matchHistory(game.point_history);
  if (!sets.length) return null;
  const ownA = resolveTeam(game.team_a, games) === team;
  return <details className="companion-result-details companion-history"><summary>Spielverlauf</summary>
    <p className="companion-hint">Gespeicherte Punktentwicklung · fehlende Abschnitte werden nicht ergänzt.</p>
    <p className="history-legend"><span>━ Euer Team</span><span>┄ Gegner</span><span>● Auszeit</span></p>
    {sets.map(set => {
      const all = [...set.points,...set.timeouts];
      const maxX = Math.max(1,...all.map(p=>p.scoreA+p.scoreB));
      const maxY = Math.max(1,...all.flatMap(p=>[p.scoreA,p.scoreB]));
      const x=(a:number,b:number)=>32+(a+b)/maxX*286;
      const y=(score:number)=>154-score/maxY*130;
      const own=(p:{scoreA:number;scoreB:number})=>ownA?p.scoreA:p.scoreB;
      const other=(p:{scoreA:number;scoreB:number})=>ownA?p.scoreB:p.scoreA;
      return <section key={set.set} className="history-set"><h3>Satz {set.set}</h3>
        {set.partial && <p className="companion-hint">Dieser Satzverlauf ist nur teilweise gespeichert.</p>}
        <svg viewBox="0 0 340 185" role="img" aria-label={`Punktentwicklung Satz ${set.set}: euer Team durchgezogen, Gegner gestrichelt. Horizontale Achse gespielte Punkte, vertikale Achse Punktestand.`}>
          {[0,Math.ceil(maxY/2),maxY].filter((v,i,a)=>a.indexOf(v)===i).map(score=><g key={score}><line x1="32" x2="318" y1={y(score)} y2={y(score)} stroke="#dce7e5"/><text x="26" y={y(score)+4} textAnchor="end">{score}</text></g>)}
          <text x="32" y="172">0</text><text x="318" y="172" textAnchor="end">{maxX} Punkte gespielt</text>
          {set.segments.map((segment,index)=><g key={index}>
            <polyline points={segment.map(p=>`${x(p.scoreA,p.scoreB)},${y(own(p))}`).join(' ')} fill="none" stroke="#137b59" strokeWidth="3"/>
            <polyline points={segment.map(p=>`${x(p.scoreA,p.scoreB)},${y(other(p))}`).join(' ')} fill="none" stroke="#64748b" strokeWidth="2" strokeDasharray="5 3"/>
            {segment.map((p,i)=><g key={i}><circle cx={x(p.scoreA,p.scoreB)} cy={y(own(p))} r="2" fill="#137b59"><title>{own(p)}:{other(p)} aus eurer Sicht</title></circle><circle cx={x(p.scoreA,p.scoreB)} cy={y(other(p))} r="2" fill="#64748b"/></g>)}
          </g>)}
          {set.timeouts.map((p,index)=><circle key={index} cx={x(p.scoreA,p.scoreB)} cy={y((p.team==='A')===ownA?own(p):other(p))} r="5" fill={(p.team==='A')===ownA?'#137b59':'#64748b'} stroke="white" strokeWidth="2"><title>Auszeit {(p.team==='A')===ownA?'eures Teams':'Gegner'} bei {own(p)}:{other(p)}</title></circle>)}
        </svg>
        {set.timeouts.length>0 && <ul className="history-timeouts">{set.timeouts.map((p,i)=><li key={i}>Auszeit {(p.team==='A')===ownA?'eures Teams':'Gegner'} bei {own(p)}:{other(p)}</li>)}</ul>}
      </section>;
    })}
  </details>;
}
