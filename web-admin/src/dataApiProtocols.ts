import { dataMode, getSupabase } from './dataApiCore';
import type { GameProtocol, ProtocolEvent, ProtocolExport } from './gameProtocols';
const summaryFields = 'game_id,tournament_id,snapshot,started_at,updated_at,event_count,has_live,has_result_entry,has_admin_changes,baseline_has_score,deleted';
export async function listGameProtocols(tournamentId: string): Promise<GameProtocol[]> {
  if (dataMode !== 'supabase') throw new Error('Spielprotokolle stehen im Supabase-Betrieb zur Verfügung.');
  const result: GameProtocol[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await getSupabase().from('game_protocols').select(summaryFields).eq('tournament_id', tournamentId).order('game_id').range(from, from + 499);
    if (error) throw new Error(error.message);
    result.push(...(data ?? []) as GameProtocol[]);
    if ((data?.length ?? 0) < 500) return result.sort((a,b)=>String(a.snapshot.number).localeCompare(String(b.snapshot.number),'de',{numeric:true}));
  }
}
export async function loadProtocolEvents(gameId: string, after = 0, through?: number): Promise<ProtocolEvent[]> {
  let query = getSupabase().from('game_protocol_events').select('id,game_id,recorded_at,source,actor_id,actor_label,score_link_id,action,changes,history_change,snapshot')
    .eq('game_id', gameId).gt('id', after).order('id').limit(100);
  if (through !== undefined) query = query.lte('id', through);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ProtocolEvent[];
}
export async function exportGameProtocols(tournament: { id: string; name: string }, protocols: GameProtocol[]): Promise<ProtocolExport> {
  const games: ProtocolExport['games'] = [];
  for (const protocol of protocols) {
    // Bound each export so a running match cannot keep the download open forever.
    const { data, error } = await getSupabase().from('game_protocol_events').select('id').eq('game_id', protocol.game_id).order('id', {ascending:false}).limit(1);
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error('Protokoll nicht mehr verfügbar. Bitte die Übersicht aktualisieren.');
    const through = data[0].id as number;
    const events: ProtocolEvent[] = [];
    for (;;) {
      const page = await loadProtocolEvents(protocol.game_id, events.at(-1)?.id ?? 0, through);
      events.push(...page);
      if (page.length < 100) break;
    }
    if (events.at(-1)?.id !== through || !['baseline','created'].includes(events[0]?.action)) {
      throw new Error('Das Protokoll konnte nicht vollständig gelesen werden. Bitte Berechtigung prüfen und erneut versuchen.');
    }
    // Rebuild the displayed final snapshot from exactly the exported event boundary.
    let snapshot = { ...protocol.snapshot };
    for (const event of events) {
      if (event.snapshot) snapshot = {...event.snapshot};
      for (const [field, change] of Object.entries(event.changes)) snapshot[field] = change.after as string | boolean | null;
    }
    games.push({protocol:{...protocol,snapshot,has_live:protocol.has_live||events.some(event=>event.source==='referee'&&event.history_change!==null),
      has_admin_changes:protocol.has_admin_changes||events.some(event=>event.source==='admin'&&event.action!=='created'),
      has_result_entry:protocol.has_result_entry||events.some(event=>event.action==='updated'&&!event.history_change&&Object.entries(event.changes).some(([key,change])=>/^set[123]_team_[ab]$/.test(key)&&!['','0'].includes(String(change.after??'')))),event_count:events.length,updated_at:events.at(-1)!.recorded_at,deleted:events.at(-1)!.action==='deleted'},events});
  }
  return {format:'courtboard-game-protocol',version:1,exported_at:new Date().toISOString(),tournament,games};
}
export function downloadProtocolJson(value: ProtocolExport) {
  downloadProtocolFile(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),`spielprotokolle-${value.tournament.id}.json`);
}
export function downloadProtocolFile(blob: Blob, filename: string) {
  const url=URL.createObjectURL(blob); const link=document.createElement('a'); link.href=url;link.download=filename;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
