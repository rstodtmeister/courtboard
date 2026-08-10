import React, { useEffect, useState } from "react";
import type { Tournament } from "../types";

export function TournamentPanel({
  tournaments,
  selectedTournament,
  selectedTournamentId,
  onSelectTournament,
  onSave,
  onDelete,
  onImport,
}: {
  tournaments: Tournament[];
  selectedTournament: Tournament;
  selectedTournamentId: string;
  onSelectTournament: (tournamentId: string) => void;
  onSave: (tournament: Tournament, options?: { silent?: boolean; successMessage?: string }) => Promise<boolean>;
  onDelete?: () => Promise<void>;
  onImport?: () => void;
}) {
  const [expandedTournamentId, setExpandedTournamentId] = useState<string | null>(null);

  function showDetails(tournamentId: string) {
    if (expandedTournamentId === tournamentId) {
      setExpandedTournamentId(null);
      return;
    }
    onSelectTournament(tournamentId);
    setExpandedTournamentId(tournamentId);
  }

  return (
    <section className="tournament-panel">
      <div className="tournament-panel-head">
        <div>
          <h3>Turniere</h3>
          <p>Eine kompakte Uebersicht aller importierten Turniere.</p>
        </div>
        {onImport && <button type="button" onClick={onImport}>HVV Turnier importieren</button>}
      </div>

      <div className="tournament-list" role="list">
        {tournaments.map((item) => {
          const isSelected = item.id === selectedTournamentId;
          return (
            <article className={isSelected ? "tournament-list-row selected" : "tournament-list-row"} key={item.id} role="listitem">
              <div className="tournament-list-main">
                <strong>{item.name}</strong>
                <span>
                  {[item.location, item.tournament_date, item.hvv_type, item.hvv_gender].filter(Boolean).join(" · ") || "Keine HVV-Details"}
                </span>
              </div>
              <div className="tournament-list-meta">
                <span>{item.courts.length} Courts</span>
                <button type="button" className="secondary" onClick={() => showDetails(item.id)}>
                  {expandedTournamentId === item.id ? "Erweitert ausblenden" : "Erweitert anzeigen"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {expandedTournamentId === selectedTournament.id && (
        <TournamentSettings tournament={selectedTournament} onSave={onSave} onDelete={onDelete} />
      )}
    </section>
  );
}

function TournamentSettings({
  tournament,
  onSave,
  onDelete,
}: {
  tournament: Tournament;
  onSave: (tournament: Tournament, options?: { silent?: boolean; successMessage?: string }) => Promise<boolean>;
  onDelete?: () => Promise<void>;
}) {
  const tournamentCourts = tournament.courts.join(", ");
  const [draft, setDraft] = useState(() => ({
    hvv_edit_url: tournament.hvv_edit_url,
    courts: tournamentCourts,
  }));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    setDraft({
      hvv_edit_url: tournament.hvv_edit_url,
      courts: tournamentCourts,
    });
    setSaveState("idle");
  }, [tournament.id, tournament.hvv_edit_url, tournamentCourts]);

  function updateDraft(update: Partial<typeof draft>) {
    setDraft((current) => ({ ...current, ...update }));
  }

  useEffect(() => {
    const nextHvvUrl = draft.hvv_edit_url.trim();
    const nextCourts = draft.courts.split(",").map((court) => court.trim()).filter(Boolean);
    if (nextHvvUrl === tournament.hvv_edit_url && draft.courts === tournamentCourts) {
      return;
    }

    setSaveState("saving");
    const timeout = window.setTimeout(async () => {
      const saved = await onSave({
        ...tournament,
        name: tournament.name,
        hvv_edit_url: nextHvvUrl,
        hvv_public_url: tournament.hvv_public_url ?? null,
        token_base_url: null,
        courts: nextCourts,
      }, { silent: true });
      setSaveState(saved ? "saved" : "idle");
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [draft, onSave, tournament, tournamentCourts]);

  return (
    <section className="config-panel">
      <div>
        <h3>Turnier</h3>
        <p>HVV-Daten werden beim Import gesetzt. Courts und HVV URL werden automatisch gespeichert.</p>
      </div>
      <label>
        Bezeichnung
        <input value={tournament.name} readOnly />
      </label>
      <label>
        HVV URL
        <input value={draft.hvv_edit_url} onChange={(event) => updateDraft({ hvv_edit_url: event.target.value })} placeholder="https://www.hvv-beach.de/testportal/" />
      </label>
      <label>
        HVV Spiele-URL
        <input value={tournament.hvv_public_url ?? ""} readOnly />
      </label>
      <label>
        Ort
        <input value={tournament.location ?? ""} readOnly />
      </label>
      <label>
        Datum
        <input value={tournament.tournament_date ?? ""} readOnly />
      </label>
      <label>
        Typ
        <input value={tournament.hvv_type ?? ""} readOnly />
      </label>
      <label>
        Geschlecht
        <input value={tournament.hvv_gender ?? ""} readOnly />
      </label>
      <label>
        Courts
        <input value={draft.courts} onChange={(event) => updateDraft({ courts: event.target.value })} />
      </label>
      <div className="config-actions">
        <span className="autosave-status" aria-live="polite">
          {saveState === "saving" ? "Speichert..." : saveState === "saved" ? "Gespeichert" : ""}
        </span>
        {onDelete && <button type="button" className="secondary danger-button" onClick={onDelete}>Turnier loeschen</button>}
      </div>
    </section>
  );
}
