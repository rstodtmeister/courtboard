import React from 'react';

export type PointFlowEvent = {
  team: 'A' | 'B';
  scoreA: number;
  scoreB: number;
};

export type PointFlowMarker = PointFlowEvent & { label: string; team?: 'A' | 'B' };

export function PointFlow({ points, markers = [], reverse = false, className = '' }: { points: PointFlowEvent[]; markers?: PointFlowMarker[]; reverse?: boolean; className?: string }) {
  if (points.length === 0) return null;
  const displayTeam = (team: 'A' | 'B') => reverse ? (team === 'A' ? 'B' : 'A') : team;
  const segments: Array<Array<{ point: PointFlowEvent; index: number }>> = [];
  points.forEach((point, index) => {
    const previous = points[index - 1];
    const continuous = previous && ((point.scoreA === previous.scoreA + 1 && point.scoreB === previous.scoreB)
      || (point.scoreB === previous.scoreB + 1 && point.scoreA === previous.scoreA));
    if (!continuous) segments.push([]);
    segments.at(-1)!.push({ point, index });
  });
  return <div className={`point-flow ${className}`.trim()} aria-label="Punkteverlauf">
    {points.length > 1 && <svg className="point-flow-connector" viewBox={`0 0 100 ${points.length * 24}`} preserveAspectRatio="none" aria-hidden="true">
      {segments.filter(segment => segment.length > 1).map((segment, segmentIndex) => <polyline key={segmentIndex} points={segment.map(({ point, index }) => `${displayTeam(point.team) === 'A' ? 25 : 75},${index * 24 + 12}`).join(' ')} />)}
    </svg>}
    {points.map((point, index) => {
      const team = displayTeam(point.team);
      const score = point.team === 'A' ? point.scoreA : point.scoreB;
      const pointMarkers = markers.filter(marker => marker.scoreA === point.scoreA && marker.scoreB === point.scoreB);
      return <React.Fragment key={`${point.team}-${index}-${point.scoreA}-${point.scoreB}`}>
        {team === 'A' ? <><span className={`point-dot full left${index === points.length - 1 ? ' final' : ''}`}>{score}</span><span /></> : <><span /><span className={`point-dot full right${index === points.length - 1 ? ' final' : ''}`}>{score}</span></>}
        {pointMarkers.map((marker, markerIndex) => <span className={`point-flow-marker ${marker.team ? `team-${displayTeam(marker.team).toLowerCase()}` : ''}`} style={{ gridRow: index + 1 }} key={`${marker.label}-${markerIndex}`}>{marker.label}</span>)}
      </React.Fragment>;
    })}
  </div>;
}
