export type HistoryEvent = { set: number; team: 'A' | 'B'; scoreA: number; scoreB: number; type?: string };
export function matchHistory(value: string | null | undefined) {
  let parsed: unknown;
  try { parsed = JSON.parse(value || '[]'); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const events: HistoryEvent[] = parsed.filter((event): event is HistoryEvent => event && [1,2,3].includes(event.set)
    && ['A','B'].includes(event.team) && [event.scoreA,event.scoreB].every(score => Number.isSafeInteger(score) && score >= 0)
    && (event.type === undefined || event.type === 'timeout'));
  return [1,2,3].flatMap(set => {
    const points = events.filter(event => event.set === set && event.type !== 'timeout');
    if (!points.length) return [];
    const segments: HistoryEvent[][] = [];
    for (const point of points) {
      const last = segments.at(-1)?.at(-1);
      const continuous = last && ((point.scoreA === last.scoreA + 1 && point.scoreB === last.scoreB) || (point.scoreB === last.scoreB + 1 && point.scoreA === last.scoreA));
      if (continuous) segments.at(-1)!.push(point);
      else segments.push([point]);
    }
    const partial = points[0].scoreA + points[0].scoreB > 1 || segments.length > 1;
    if (points[0].scoreA + points[0].scoreB === 1) segments[0].unshift({...points[0],scoreA:0,scoreB:0});
    return [{set,points,segments,partial,timeouts:events.filter(event => event.set === set && event.type === 'timeout')}];
  });
}
