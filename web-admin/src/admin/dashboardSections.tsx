import React, { FormEvent, useEffect, useMemo, useState } from "react";
import type { HvvTournamentOption } from "../dataApi";
import { QrCode } from "../QrCode";
import type { AdminRole, AdminUser, Game, ScoreLink, Tournament } from "../types";
import { CompactLink, displayUrl, formatDateTime, scoreUrl } from "./shared";
import { courtLabel, isAssignedCourt, isCompleted, resolvedReferee, sortGames } from "./GamesEditor";

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

export function AdminUsersPanel({
  admins,
  tournaments,
  currentUserEmail,
  onInvite,
  onUpdate,
  onUpdateTournaments,
  onDelete,
}: {
  admins: AdminUser[];
  tournaments: Tournament[];
  currentUserEmail: string;
  onInvite: (email: string, role: AdminRole) => Promise<boolean>;
  onUpdate: (admin: AdminUser, action: "confirm" | "resendInvite" | "updateRole" | "setSuspended", params?: { role?: AdminRole; suspended?: boolean }) => Promise<boolean>;
  onUpdateTournaments: (admin: AdminUser, tournamentIds: string[]) => Promise<boolean>;
  onDelete: (admin: AdminUser) => Promise<boolean>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("admin");
  const [saving, setSaving] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const superadminCount = admins.filter((admin) => admin.role === "superadmin").length;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const ok = await onInvite(email.trim(), role);
    if (ok) {
      setEmail("");
      setRole("admin");
    }
    setSaving(false);
  }

  async function deleteSelected(admin: AdminUser) {
    const label = admin.email || admin.user_id;
    if (!window.confirm(`Admin ${label} wirklich loeschen? Der Zugang wird aus Supabase Auth entfernt.`)) {
      return;
    }
    setDeletingUserId(admin.user_id);
    await onDelete(admin);
    setDeletingUserId("");
  }

  async function runAction(admin: AdminUser, action: "confirm" | "resendInvite" | "updateRole" | "setSuspended", params: { role?: AdminRole; suspended?: boolean } = {}) {
    const key = `${admin.user_id}:${action}`;
    setBusyAction(key);
    await onUpdate(admin, action, params);
    setBusyAction("");
  }

  async function toggleTournament(admin: AdminUser, tournamentId: string, selected: boolean) {
    const currentIds = admin.tournament_ids ?? [];
    const nextIds = selected
      ? [...new Set([...currentIds, tournamentId])]
      : currentIds.filter((id) => id !== tournamentId);
    const key = `${admin.user_id}:tournaments`;
    setBusyAction(key);
    await onUpdateTournaments(admin, nextIds);
    setBusyAction("");
  }

  return (
    <section className="admin-users-panel">
      <form className="admin-invite-form" onSubmit={submit}>
        <div>
          <h3>Admin einladen</h3>
          <p>Der neue Admin bekommt eine E-Mail und legt sein Passwort ueber den Einladungslink fest.</p>
        </div>
        <label>
          E-Mail
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          Rolle
          <select value={role} onChange={(event) => setRole(event.target.value as AdminRole)}>
            <option value="admin">Admin</option>
            <option value="superadmin">Superadmin</option>
          </select>
        </label>
        <button type="submit" disabled={saving}>{saving ? "Sendet..." : "Einladen"}</button>
      </form>
      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>E-Mail</th>
              <th>Rolle</th>
              <th>Status</th>
              <th>Turniere</th>
              <th>Angelegt</th>
              <th>Letzter Login</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((admin) => {
              const isCurrentUser = admin.email.toLowerCase() === currentUserEmail.toLowerCase();
              const isLastSuperadmin = admin.role === "superadmin" && superadminCount <= 1;
              const isSuspended = isAdminSuspended(admin);
              const deleteDisabled = deletingUserId === admin.user_id || isCurrentUser || isLastSuperadmin;
              const actionDisabled = isCurrentUser || busyAction.startsWith(`${admin.user_id}:`);
              return (
                <tr key={admin.user_id}>
                  <td>{admin.email}</td>
                  <td>
                    <select
                      className="admin-role-select"
                      value={admin.role}
                      onChange={(event) => runAction(admin, "updateRole", { role: event.target.value as AdminRole })}
                      disabled={actionDisabled || isLastSuperadmin}
                      title={isCurrentUser ? "Eigene Rolle nicht hier aendern" : isLastSuperadmin ? "Letzter Superadmin kann nicht geaendert werden" : "Rolle aendern"}
                    >
                      <option value="admin">Admin</option>
                      <option value="superadmin">Superadmin</option>
                    </select>
                  </td>
                  <td><AdminStatus admin={admin} /></td>
                  <td>
                    {admin.role === "superadmin" ? (
                      <span className="badge active">Alle</span>
                    ) : (
                      <div className="admin-tournament-list">
                        {tournaments.map((tournament) => (
                          <label key={tournament.id}>
                            <input
                              type="checkbox"
                              checked={(admin.tournament_ids ?? []).includes(tournament.id)}
                              onChange={(event) => toggleTournament(admin, tournament.id, event.target.checked)}
                              disabled={actionDisabled || busyAction === `${admin.user_id}:tournaments`}
                            />
                            {tournament.name}
                          </label>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>{formatDateTime(admin.created_at)}</td>
                  <td>{admin.last_sign_in_at ? formatDateTime(admin.last_sign_in_at) : "-"}</td>
                  <td className="admin-actions">
                    {!admin.email_confirmed_at && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => runAction(admin, "confirm")}
                        disabled={actionDisabled}
                      >
                        {busyAction === `${admin.user_id}:confirm` ? "Schaltet frei..." : "Freischalten"}
                      </button>
                    )}
                    {!admin.email_confirmed_at && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => runAction(admin, "resendInvite")}
                        disabled={actionDisabled}
                      >
                        {busyAction === `${admin.user_id}:resendInvite` ? "Sendet..." : "E-Mail erneut"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => runAction(admin, "setSuspended", { suspended: !isSuspended })}
                      disabled={actionDisabled || (isLastSuperadmin && !isSuspended)}
                      title={isCurrentUser ? "Eigenen Zugang nicht hier sperren" : isLastSuperadmin ? "Letzter Superadmin kann nicht gesperrt werden" : isSuspended ? "Admin entsperren" : "Admin sperren"}
                    >
                      {busyAction === `${admin.user_id}:setSuspended` ? "Aendert..." : isSuspended ? "Entsperren" : "Sperren"}
                    </button>
                    <button
                      type="button"
                      className="secondary danger-button"
                      onClick={() => deleteSelected(admin)}
                      disabled={deleteDisabled}
                      title={isCurrentUser ? "Eigenen Zugang nicht hier loeschen" : isLastSuperadmin ? "Letzter Superadmin kann nicht geloescht werden" : "Admin loeschen"}
                    >
                      {deletingUserId === admin.user_id ? "Loescht..." : "Loeschen"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

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
        <TournamentSettings
          tournament={selectedTournament}
          onSave={onSave}
          onDelete={onDelete}
        />
      )}
    </section>
  );
}

export function CourtLinksPanel({
  courts,
  games,
  links,
  tournamentId,
  onCreateCourtLink,
  onReplaceCourtLink,
  onUnlockCourt,
}: {
  courts: Array<{ court: string; tournamentId: string }>;
  games: Game[];
  links: ScoreLink[];
  tournamentId: string;
  onCreateCourtLink: (court: string, tournamentId: string) => Promise<void>;
  onReplaceCourtLink: (court: string, tournamentId: string, linkId: string) => Promise<void>;
  onUnlockCourt: (court: string) => Promise<void>;
}) {
  const sortedGames = sortGames(games);
  const [displayOrientation, setDisplayOrientation] = useState<"normal" | "landscape">("normal");

  return (
    <section className="court-link-panel">
      <div className="subsection-heading">
        <div>
          <h3>Court-QR-Codes</h3>
          <p>Ein fester QR-Code pro Court. Das erste Geraet sperrt die Eingabe fuer das aktuelle Spiel.</p>
        </div>
        <div className="court-display-link-controls">
          <select value={displayOrientation} onChange={(event) => setDisplayOrientation(event.target.value as "normal" | "landscape")} aria-label="Ausrichtung fuer Courts-Anzeige">
            <option value="normal">Standard</option>
            <option value="landscape">Querformat</option>
          </select>
          <a className="secondary-link" href={displayUrl(tournamentId, displayOrientation)} target="_blank" rel="noreferrer">Courts anzeigen</a>
        </div>
      </div>
      <div className="court-link-grid">
        {courts.map((entry) => {
          const link = links.find((item) => item.court === entry.court);
          const currentGame = sortedGames.find((game) => game.tournament_id === entry.tournamentId && game.court === entry.court && !isCompleted(game));
          const lockedGame = sortedGames.find((game) => game.tournament_id === entry.tournamentId && game.court === entry.court && !isCompleted(game) && game.score_locked_by_device);
          const value = link?.token ? scoreUrl(link.token) : "";
          return (
            <div className="court-link-card" key={entry.court}>
              <div className="court-link-card-head">
                <strong>Court {entry.court}</strong>
                <span className={lockedGame ? "badge" : "badge active"}>{lockedGame ? "Geraet aktiv" : "frei"}</span>
              </div>
              <div className="court-link-current">
                {currentGame ? (
                  <>
                    <span>Aktuelles Spiel</span>
                    <strong>Nr. {currentGame.number}: {currentGame.team_a} vs. {currentGame.team_b}</strong>
                  </>
                ) : (
                  <span>Kein offenes Spiel</span>
                )}
              </div>
              {value ? (
                <div className="court-link-qr">
                  <QrCode value={value} compact />
                  <CompactLink value={value} hideQr />
                </div>
              ) : link ? (
                <button type="button" onClick={() => onReplaceCourtLink(entry.court, entry.tournamentId, link.id)}>
                  QR-Code neu erzeugen
                </button>
              ) : (
                <button type="button" onClick={() => onCreateCourtLink(entry.court, entry.tournamentId)}>
                  QR-Code erzeugen
                </button>
              )}
              <button type="button" className="secondary" onClick={() => onUnlockCourt(entry.court)} disabled={!lockedGame}>
                Court entsperren
              </button>
              {link && value && (
                <button type="button" className="secondary" onClick={() => onReplaceCourtLink(entry.court, entry.tournamentId, link.id)}>
                  QR-Code ersetzen
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
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

function AdminStatus({ admin }: { admin: AdminUser }) {
  const suspended = isAdminSuspended(admin);
  return (
    <div className="admin-status-list">
      {suspended && <span className="badge danger">Gesperrt</span>}
      {admin.email_confirmed_at ? <span className="badge active">Bestaetigt</span> : <span className="badge">Einladung offen</span>}
      {admin.password_setup_required ? <span className="badge">Passwort fehlt</span> : <span className="badge active">Passwort eingerichtet</span>}
      {admin.role === "superadmin" && <span className="badge">Superadmin</span>}
    </div>
  );
}

function isAdminSuspended(admin: AdminUser) {
  if (!admin.banned_until) {
    return false;
  }
  const bannedUntil = Date.parse(admin.banned_until);
  return Number.isNaN(bannedUntil) || bannedUntil > Date.now();
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
        <input
          value={draft.hvv_edit_url}
          onChange={(event) => updateDraft({ hvv_edit_url: event.target.value })}
          placeholder="https://www.hvv-beach.de/testportal/"
        />
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
