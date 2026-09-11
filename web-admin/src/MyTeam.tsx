import React, { createContext, useContext, useState } from 'react';
import { isSelectableTeam } from './teamNames';
import type { Game } from './types';

const MyTeamContext = createContext('');
export function useMyTeam() { return useContext(MyTeamContext); }
export function isMyTeamGame(game: Game, team: string) {
  return Boolean(team && [game.team_a?.trim(), game.team_b?.trim()].includes(team));
}
export function MyTeam({ tournamentId, games, children }: { tournamentId: string; games: Game[]; children: React.ReactNode }) {
  const key = `courtboard.myTeam.v1.${tournamentId}`;
  const [team, setTeam] = useState(() => {
    try { const saved = localStorage.getItem(key); if (isSelectableTeam(saved)) return saved!; localStorage.removeItem(key); return ''; } catch { return ''; }
  });
  const teams = [...new Set(games.flatMap(game => [game.team_a, game.team_b]).map(name => name?.trim() || '').filter(isSelectableTeam))].sort((a, b) => a.localeCompare(b, 'de'));
  const [storageError, setStorageError] = useState(false);
  function choose(value: string) {
    setTeam(value);
    try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); setStorageError(false); }
    catch { setStorageError(true); }
  }
  return <MyTeamContext.Provider value={team}>
    <div className="my-team-bar">
      <label htmlFor="my-team-select">{team ? '★' : '☆'} Mein Team</label>
      <select id="my-team-select" value={team} onChange={event => choose(event.target.value)}>
        <option value="">Team wählen / Auswahl entfernen</option>
        {team && !teams.includes(team) && <option value={team}>{team} (derzeit nicht im Spielplan)</option>}
        {teams.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
      {team && <button type="button" className="secondary" onClick={() => choose('')} aria-label="Mein Team entfernen">Entfernen</button>}
      {storageError && <small role="status">Auswahl gilt nur bis zum Neuladen; Speichern auf diesem Gerät ist nicht möglich.</small>}
    </div>
    {children}
  </MyTeamContext.Provider>;
}
