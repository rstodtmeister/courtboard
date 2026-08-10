import React, { FormEvent, useState } from "react";
import type { HvvTournamentOption } from "../dataApi";

export function HvvProgressDialog({ message }: { message: string }) {
  return (
    <div className="app-dialog-backdrop" role="presentation">
      <section className="app-dialog hvv-progress-dialog" role="status" aria-live="polite" aria-label="HVV Vorgang laeuft">
        <div className="hvv-progress-spinner" aria-hidden="true" />
        <div>
          <h3>HVV wird geladen</h3>
          <p>{message}</p>
        </div>
      </section>
    </div>
  );
}

export function HvvCredentialsDialog({
  onSave,
  onClose,
}: {
  onSave: (username: string, password: string) => void;
  onClose: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError("HVV-Benutzer und Passwort sind erforderlich.");
      return;
    }
    onSave(username.trim(), password);
  }

  return (
    <div className="app-dialog-backdrop" role="presentation">
      <section className="app-dialog" role="dialog" aria-modal="true" aria-labelledby="hvv-credentials-title">
        <h3 id="hvv-credentials-title">HVV-Zugang</h3>
        <p>Der Zugang wird nur fuer diese laufende Admin-Sitzung gehalten und beim Abmelden oder nach Ablauf geloescht.</p>
        <form className="form-grid" onSubmit={submit}>
          <label>
            HVV-Benutzer
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </label>
          <label>
            HVV-Passwort
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
          </label>
          {error && <div className="error">{error}</div>}
          <div className="app-dialog-actions">
            <button type="button" className="secondary" onClick={onClose}>Abbrechen</button>
            <button type="submit">Fortfahren</button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function HvvTournamentDialog({
  tournaments,
  selectedTournamentId,
  mode,
  onSelect,
  onClose,
}: {
  tournaments: HvvTournamentOption[];
  selectedTournamentId: string;
  mode: "update" | "create";
  onSelect: (tournament: HvvTournamentOption) => Promise<void>;
  onClose: () => void;
}) {
  const [busyId, setBusyId] = useState("");

  async function selectTournament(tournament: HvvTournamentOption) {
    setBusyId(tournament.hvv_turnier_id);
    await onSelect(tournament);
    setBusyId("");
  }

  return (
    <div className="app-dialog-backdrop" role="presentation">
      <section className="app-dialog hvv-tournament-dialog" role="dialog" aria-modal="true" aria-labelledby="hvv-tournament-title">
        <h3 id="hvv-tournament-title">{mode === "create" ? "HVV Turnier importieren" : "HVV Turnier auswaehlen"}</h3>
        <div className="table-wrap hvv-tournament-table-wrap">
          <table className="admin-table hvv-tournament-table">
            <thead>
              <tr>
                <th>Bezeichnung</th>
                <th>Datum</th>
                <th>Ort</th>
                <th>Typ</th>
                <th>Geschlecht</th>
                <th>IDs</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {tournaments.map((item) => {
                const selected = item.hvv_turnier_id === selectedTournamentId;
                return (
                  <tr key={`${item.hvv_veranstaltung_id}:${item.hvv_turnier_id}`}>
                    <td>{item.name}</td>
                    <td>{item.tournament_date || "-"}</td>
                    <td>{item.location || "-"}</td>
                    <td>{item.hvv_type || "-"}</td>
                    <td>{item.hvv_gender || "-"}</td>
                    <td>{item.hvv_turnier_id}/{item.hvv_veranstaltung_id}</td>
                    <td>
                      <button type="button" onClick={() => selectTournament(item)} disabled={Boolean(busyId)}>
                        {busyId === item.hvv_turnier_id ? "Speichert..." : mode === "create" ? "Importieren" : selected ? "Aktualisieren" : "Auswaehlen"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {tournaments.length === 0 && (
                <tr>
                  <td colSpan={7}>Keine HVV-Turniere gefunden.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="app-dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>Schliessen</button>
        </div>
      </section>
    </div>
  );
}

export function sortHvvTournamentsByDate(options: HvvTournamentOption[]) {
  return [...options].sort((left, right) => {
    const leftDate = firstTournamentDateKey(left.tournament_date);
    const rightDate = firstTournamentDateKey(right.tournament_date);
    if (leftDate && rightDate) {
      return leftDate - rightDate || left.name.localeCompare(right.name, "de");
    }
    if (leftDate) {
      return -1;
    }
    if (rightDate) {
      return 1;
    }
    return left.name.localeCompare(right.name, "de");
  });
}

function firstTournamentDateKey(value: string) {
  const currentYear = new Date().getFullYear();
  const isoMatch = value.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    return validDateKey(Number.parseInt(isoMatch[1], 10), Number.parseInt(isoMatch[2], 10), Number.parseInt(isoMatch[3], 10));
  }

  const matches = [...value.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(?:(\d{4}|\d{2}))?(?!\d)/g)];
  const keys = matches
    .map((match, index) => {
      const yearText = match[3] ?? nextExplicitTournamentYear(matches, index) ?? String(currentYear);
      const yearPart = Number.parseInt(yearText, 10);
      const year = yearText.length === 2 ? 2000 + yearPart : yearPart;
      return validDateKey(year, Number.parseInt(match[2], 10), Number.parseInt(match[1], 10));
    })
    .filter((key): key is number => key !== null);
  if (keys.length > 0) {
    return Math.min(...keys);
  }

  return null;
}

function nextExplicitTournamentYear(matches: RegExpMatchArray[], startIndex: number) {
  for (let index = startIndex + 1; index < matches.length; index++) {
    if (matches[index][3]) {
      return matches[index][3];
    }
  }
  return "";
}

function validDateKey(year: number, month: number, day: number) {
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return year * 10000 + month * 100 + day;
}
