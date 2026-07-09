import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CourtDisplayApp } from "./CourtDisplayApp";
import { ScoreEntryApp } from "./ScoreEntryApp";
import {
  createScoreLink as createScoreLinkData,
  deleteAdminUser,
  disableScoreLink,
  getHvvCredentialsStatus,
  getSession,
  getTournament,
  inviteAdminUser,
  listGames,
  listAdminUsers,
  listScoreLinks,
  loadScoreEntry,
  onSessionChange,
  saveGame as saveGameData,
  saveTournament,
  signIn,
  signOut,
  setHvvCredentials,
  syncGamesFromHvv,
  submitScore,
  unlockScoreGame,
} from "./dataApi";
import { gameRatingOptions, noRefereeSelection, specialGameRatingOptions } from "./appConfig";
import type { PdfSheetType } from "./pdfExport";
import {
  completedSetRows,
  draftFromGame,
  draftWithSetScore,
  finalSetRows,
  isPlausibleSetResult,
  parsePointHistory,
  parseTimeoutHistory,
  parseScore,
  resultFromCompletedSetScores,
  scoreForSet,
  secondServer,
  serializePointHistory,
  serviceOrder,
  setScoreForSide,
  validateManualResult,
  withScoreAutomation,
} from "./scoreLogic";
import type { AdminRole, AdminUser, AppSession, Game, GameDraft, ScoreEntryData, ScoreLink, Tournament } from "./types";
import type {
  AdminTab,
  LiveSnapshot,
  ScoreEntryResumeState,
  ScoreWorkflowStep,
  ServerSetupStep,
  TeamKey,
} from "./workflowTypes";
import { QrCode } from "./QrCode";
import "./styles.css";

function App() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") ?? "";
  const view = params.get("view") ?? "";
  const court = params.get("court") ?? "";

  if (token) {
    return <ScoreEntryApp token={token} />;
  }

  if (view === "courts") {
    return <CourtDisplayApp court={court} />;
  }

  return <AdminApp />;
}

function AdminApp() {
  const [session, setSession] = useState<AppSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  useEffect(() => {
    getSession().then((nextSession) => {
      setSession(nextSession);
      setLoadingSession(false);
    });

    return onSessionChange(setSession);
  }, []);

  if (loadingSession) {
    return <Shell><div className="status">Lade Sitzung...</div></Shell>;
  }

  return (
    <Shell>
      {session ? <AdminDashboard session={session} /> : <LoginForm />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="app">
      <header className="topbar">
        <div>
          <h1>Court Board-Admin</h1>
        </div>
      </header>
      {children}
    </main>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const { error: signInError } = await signIn(email, password);

    setBusy(false);
    if (signInError) {
      setError(signInError);
    }
  }

  return (
    <section className="panel login-panel">
      <h2>Admin Login</h2>
      <p className="login-hint">Spiele bearbeiten, Turnierstatus pflegen und Ergebnislinks erzeugen</p>
      <form onSubmit={submit} className="form-grid">
        <label>
          E-Mail
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          Passwort
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={busy}>{busy ? "Anmelden..." : "Anmelden"}</button>
      </form>
    </section>
  );
}

function AdminDashboard({ session }: { session: AppSession }) {
  const [games, setGames] = useState<Game[]>([]);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [scoreLinks, setScoreLinks] = useState<ScoreLink[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusSyncing, setStatusSyncing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [printing, setPrinting] = useState<PdfSheetType | "">("");
  const [activeTab, setActiveTab] = useState<AdminTab>("games");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [linkText, setLinkText] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState("");
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [pendingSyncOverwriteCourts, setPendingSyncOverwriteCourts] = useState<boolean | null>(null);
  const [showHvvCredentialsDialog, setShowHvvCredentialsDialog] = useState(false);
  const isSuperadmin = session.user.role === "superadmin";

  const loadDashboard = useCallback(async (options: { silent?: boolean; initial?: boolean } = {}) => {
    const silent = options.silent ?? false;
    if (options.initial) {
      setLoading(true);
    } else if (!silent) {
      setStatusSyncing(true);
    }
    if (!silent) {
      setError("");
      setMessage("");
    }

    try {
      const [gameData, tournamentData, linkData, adminsData] = await Promise.all([
        listGames(),
        getTournament(),
        listScoreLinks(),
        isSuperadmin ? listAdminUsers() : Promise.resolve([]),
      ]);
      setGames(gameData);
      setTournament(tournamentData);
      setScoreLinks(linkData);
      setAdminUsers(adminsData);
      setLastSyncedAt(formatSyncTime(new Date()));
    } catch (gamesError) {
      if (!silent) {
        setError(gamesError instanceof Error ? gamesError.message : "Dashboard konnte nicht geladen werden.");
      }
    } finally {
      if (options.initial) {
        setLoading(false);
      }
      if (!silent) {
        setStatusSyncing(false);
      }
    }
  }, [isSuperadmin]);

  useEffect(() => {
    loadDashboard({ initial: true });
    const interval = window.setInterval(() => {
      loadDashboard({ silent: true });
    }, 10000);
    return () => window.clearInterval(interval);
  }, [loadDashboard]);

  async function saveTournamentDraft(nextTournament: Tournament) {
    setError("");
    setMessage("");

    try {
      const saved = await saveTournament(nextTournament);
      setTournament(saved);
      setMessage("Turnier gespeichert.");
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Turnier konnte nicht gespeichert werden.");
      return false;
    }
  }

  async function saveGame(game: Game, draft: GameDraft) {
    setError("");
    setMessage("");

    try {
      const data = await saveGameData(game, draft);
      setGames((current) => current.map((item) => (item.id === game.id ? data : item)));
      setMessage(`Spiel ${game.number} gespeichert.`);
      return true;
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Spiel konnte nicht gespeichert werden.");
      return false;
    }
  }

  async function createScoreLink(game: Game) {
    setError("");
    setMessage("");
    setLinkText("");

    try {
      const data = await createScoreLinkData({
        tournamentId: game.tournament_id,
        gameId: game.id,
      });
      const url = scoreUrl(data.token, tournament?.token_base_url);
      setLinkText(url);
      setScoreLinks(await listScoreLinks());
      setMessage(`Ergebnislink fuer Spiel ${game.number} erzeugt.`);
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "Link konnte nicht erzeugt werden.");
    }
  }

  async function createCourtLink(court: string, tournamentId: string) {
    setError("");
    setMessage("");
    setLinkText("");

    try {
      await createScoreLinkData({
        tournamentId,
        court,
      });
      setScoreLinks(await listScoreLinks());
      setMessage(`Ergebnislink fuer Court ${court} erzeugt.`);
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "Court-Link konnte nicht erzeugt werden.");
    }
  }

  async function replaceCourtLink(court: string, tournamentId: string, linkId: string) {
    setError("");
    setMessage("");
    setLinkText("");

    try {
      await disableScoreLink(linkId);
      const lockedGame = games.find((game) => game.court === court && !isCompleted(game) && game.score_locked_by_device);
      if (lockedGame) {
        await unlockScoreGame(lockedGame.id);
      }
      await createScoreLinkData({ tournamentId, court });
      setScoreLinks(await listScoreLinks());
      setGames(await listGames());
      setMessage(`QR-Code fuer Court ${court} ersetzt.`);
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "Court-Link konnte nicht ersetzt werden.");
    }
  }

  const dirtyCount = useMemo(() => games.filter((game) => game.dirty).length, [games]);
  const courts = useMemo(() => {
    const configuredCourts = tournament?.courts
      .filter(isAssignedCourt)
      .map((court) => ({ court, tournamentId: tournament.id })) ?? [];
    const gameCourts = games
      .filter((game) => isAssignedCourt(game.court) && game.tournament_id)
      .map((game) => ({ court: game.court!, tournamentId: game.tournament_id }));
    const entries = [...configuredCourts, ...gameCourts];
    return entries.filter((entry, index) => entries.findIndex((item) => item.court === entry.court) === index);
  }, [games, tournament]);

  const courtLinks = useMemo(() => scoreLinks.filter((link) => link.court && !link.game_id && !link.disabled_at), [scoreLinks]);

  async function unlockGame(gameId: string) {
    setError("");
    setMessage("");
    try {
      await unlockScoreGame(gameId);
      setGames(await listGames());
      setScoreLinks(await listScoreLinks());
      setMessage("Eingabesperre geloest.");
    } catch (unlockError) {
      setError(unlockError instanceof Error ? unlockError.message : "Eingabesperre konnte nicht geloest werden.");
    }
  }

  async function unlockCourt(court: string) {
    const lockedGame = games.find((game) => game.court === court && !isCompleted(game) && game.score_locked_by_device);
    if (!lockedGame) {
      setMessage(`Court ${court} ist frei.`);
      return;
    }
    await unlockGame(lockedGame.id);
  }

  async function syncGames(overwriteCourts: boolean) {
    setShowSyncDialog(false);
    if (!getHvvCredentialsStatus().active) {
      setPendingSyncOverwriteCourts(overwriteCourts);
      setShowHvvCredentialsDialog(true);
      return;
    }
    setSyncing(true);
    setError("");
    setMessage("");
    try {
      const result = await syncGamesFromHvv({ overwriteCourts });
      await loadDashboard();
      setMessage(`${result.imported} Spiele geladen. ${result.message}`);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Spiele konnten nicht geladen werden.");
    } finally {
      setSyncing(false);
    }
  }

  async function continuePendingSync() {
    const overwriteCourts = pendingSyncOverwriteCourts;
    setPendingSyncOverwriteCourts(null);
    setShowHvvCredentialsDialog(false);
    if (overwriteCourts !== null) {
      await syncGames(overwriteCourts);
    }
  }

  async function inviteAdmin(email: string, role: AdminRole) {
    setError("");
    setMessage("");
    try {
      await inviteAdminUser({ email, role });
      setAdminUsers(await listAdminUsers());
      setMessage(`Einladung an ${email} gesendet.`);
      return true;
    } catch (adminError) {
      setError(adminError instanceof Error ? adminError.message : "Admin konnte nicht eingeladen werden.");
      return false;
    }
  }

  async function deleteAdmin(admin: AdminUser) {
    setError("");
    setMessage("");
    try {
      await deleteAdminUser(admin.user_id);
      setAdminUsers(await listAdminUsers());
      setMessage(`Admin ${admin.email || admin.user_id} geloescht.`);
      return true;
    } catch (adminError) {
      setError(adminError instanceof Error ? adminError.message : "Admin konnte nicht geloescht werden.");
      return false;
    }
  }

  async function printPdf(selectedGames: Game[], sheetType: PdfSheetType) {
    setError("");
    setMessage("");
    setLinkText("");

    if (selectedGames.length === 0) {
      setError("Bitte mindestens ein Spiel fuer den PDF-Druck auswaehlen.");
      return;
    }

    setPrinting(sheetType);
    try {
      const { writeScoreSheetPdf } = await import("./pdfExport");
      await writeScoreSheetPdf(selectedGames.map((game) => ({ ...game, referee: resolvedReferee(game, games) })), sheetType);
      const savedGames = await Promise.all(
        selectedGames
          .filter((game) => !game.printed)
          .map((game) => saveGameData(game, { ...draftFromGame(game), printed: true })),
      );
      if (savedGames.length > 0) {
        setGames((current) => current.map((game) => savedGames.find((saved) => saved.id === game.id) ?? game));
      }
      setMessage(`${selectedGames.length} Spiele als PDF erzeugt.`);
    } catch (printError) {
      setError(printError instanceof Error ? printError.message : "PDF konnte nicht erzeugt werden.");
    } finally {
      setPrinting("");
    }
  }

  const completedGamesCount = useMemo(() => games.filter(isCompleted).length, [games]);

  return (
    <section className="panel wide-panel">
      <div className="toolbar">
        <div>
          <p className="toolbar-status">{games.length} Spiele, {dirtyCount} geaendert{lastSyncedAt ? `, Sync ${lastSyncedAt}` : ""}</p>
        </div>
        <button type="button" className="secondary sync-button" onClick={() => loadDashboard()} disabled={loading || statusSyncing}>
          {statusSyncing ? "Sync..." : "Sync"}
        </button>
      </div>
      <TournamentProgress completed={completedGamesCount} total={games.length} />

      <AdminTabs
        activeTab={activeTab}
        gamesCount={games.length}
        courtsCount={courts.length}
        adminCount={adminUsers.length}
        isSuperadmin={isSuperadmin}
        onChange={setActiveTab}
      />

      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}
      {linkText && <LinkOutput value={linkText} />}
      {loading ? (
        <div className="status">Dashboard wird geladen...</div>
      ) : (
        <div className="admin-tab-panel">
          {activeTab === "games" && (
            <GamesEditor games={games} tournament={tournament} onSave={saveGame} onUnlockGame={unlockGame} onPrintPdf={printPdf} printing={printing} />
          )}
          {activeTab === "courts" && (
            courts.length > 0 ? (
              <CourtLinksPanel
                courts={courts}
                games={games}
                links={courtLinks}
                tokenBaseUrl={tournament?.token_base_url}
                onCreateCourtLink={createCourtLink}
                onReplaceCourtLink={replaceCourtLink}
                onUnlockCourt={unlockCourt}
              />
            ) : (
              <div className="empty">Noch keine numerischen Courts konfiguriert.</div>
            )
          )}
          {activeTab === "settings" && (
            tournament ? (
              <TournamentSettings
                tournament={tournament}
                syncing={syncing}
                loading={loading}
                onSyncGames={() => setShowSyncDialog(true)}
                onOpenCourtDisplay={() => window.open(displayUrl(), "_blank")}
                onSignOut={signOut}
                onSave={saveTournamentDraft}
              />
            ) : <div className="empty">Turnierdaten fehlen.</div>
          )}
          {activeTab === "admins" && isSuperadmin && (
            <AdminUsersPanel admins={adminUsers} currentUserEmail={session.user.email} onInvite={inviteAdmin} onDelete={deleteAdmin} />
          )}
        </div>
      )}
      {showSyncDialog && (
        <AppDialog
          title="Spiele laden"
          message="Sollen die Courts aus HVV übernommen werden? Schiedsgerichte werden nicht aus HVV übernommen."
          secondaryLabel="Lokale Courts behalten"
          primaryLabel="HVV-Courts übernehmen"
          onSecondary={() => syncGames(false)}
          onPrimary={() => syncGames(true)}
          onClose={() => setShowSyncDialog(false)}
        />
      )}
      {showHvvCredentialsDialog && (
        <HvvCredentialsDialog
          onSave={(username, password) => {
            setHvvCredentials(username, password);
            void continuePendingSync();
          }}
          onClose={() => {
            setPendingSyncOverwriteCourts(null);
            setShowHvvCredentialsDialog(false);
          }}
        />
      )}
    </section>
  );
}

function TournamentProgress({ completed, total }: { completed: number; total: number }) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="tournament-progress" aria-label={`${completed} von ${total} Spielen abgeschlossen`}>
      <div className="tournament-progress-label">
        <span>{completed}/{total} abgeschlossen</span>
        <strong>{percent}%</strong>
      </div>
      <div className="tournament-progress-track" aria-hidden="true">
        <div className="tournament-progress-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function AdminTabs({
  activeTab,
  gamesCount,
  courtsCount,
  adminCount,
  isSuperadmin,
  onChange,
}: {
  activeTab: AdminTab;
  gamesCount: number;
  courtsCount: number;
  adminCount: number;
  isSuperadmin: boolean;
  onChange: (tab: AdminTab) => void;
}) {
  const tabs: Array<{ id: AdminTab; label: string; count?: number }> = [
    { id: "games", label: "Spiele", count: gamesCount },
    { id: "courts", label: "Courts", count: courtsCount },
    { id: "settings", label: "Turnier" },
  ];
  if (isSuperadmin) {
    tabs.push({ id: "admins", label: "Admins", count: adminCount });
  }

  return (
    <nav className="admin-tabs" aria-label="Admin Bereiche">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={activeTab === tab.id ? "active" : ""}
          onClick={() => onChange(tab.id)}
          aria-current={activeTab === tab.id ? "page" : undefined}
        >
          <span>{tab.label}</span>
          {typeof tab.count === "number" && <strong>{tab.count}</strong>}
        </button>
      ))}
    </nav>
  );
}

function HvvCredentialsDialog({
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

function AdminUsersPanel({
  admins,
  currentUserEmail,
  onInvite,
  onDelete,
}: {
  admins: AdminUser[];
  currentUserEmail: string;
  onInvite: (email: string, role: AdminRole) => Promise<boolean>;
  onDelete: (admin: AdminUser) => Promise<boolean>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("admin");
  const [saving, setSaving] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState("");
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

  return (
    <section className="admin-users-panel">
      <form className="admin-invite-form" onSubmit={submit}>
        <div>
          <h3>Admin einladen</h3>
          <p>Der neue Admin bekommt eine E-Mail und setzt seinen Zugang ueber Supabase Auth.</p>
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
              <th>Angelegt</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((admin) => {
              const isCurrentUser = admin.email.toLowerCase() === currentUserEmail.toLowerCase();
              const isLastSuperadmin = admin.role === "superadmin" && superadminCount <= 1;
              const deleteDisabled = deletingUserId === admin.user_id || isCurrentUser || isLastSuperadmin;
              return (
                <tr key={admin.user_id}>
                  <td>{admin.email}</td>
                  <td>{admin.role === "superadmin" ? "Superadmin" : "Admin"}</td>
                  <td>{admin.email_confirmed_at ? "E-Mail bestaetigt" : "Einladung offen"}</td>
                  <td>{formatDateTime(admin.created_at)}</td>
                  <td>
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

function TournamentSettings({
  tournament,
  syncing,
  loading,
  onSyncGames,
  onOpenCourtDisplay,
  onSignOut,
  onSave,
}: {
  tournament: Tournament;
  syncing: boolean;
  loading: boolean;
  onSyncGames: () => void;
  onOpenCourtDisplay: () => void;
  onSignOut: () => Promise<void>;
  onSave: (tournament: Tournament) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(() => ({
    name: tournament.name,
    hvv_edit_url: tournament.hvv_edit_url,
    hvv_public_url: tournament.hvv_public_url ?? "",
    token_base_url: tournament.token_base_url ?? "",
    courts: tournament.courts.join(", "),
  }));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (dirty) {
      return;
    }
    setDraft({
      name: tournament.name,
      hvv_edit_url: tournament.hvv_edit_url,
      hvv_public_url: tournament.hvv_public_url ?? "",
      token_base_url: tournament.token_base_url ?? "",
      courts: tournament.courts.join(", "),
    });
  }, [dirty, tournament]);

  function updateDraft(update: Partial<typeof draft>) {
    setDirty(true);
    setDraft((current) => ({ ...current, ...update }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const saved = await onSave({
      ...tournament,
      name: draft.name.trim(),
      hvv_edit_url: draft.hvv_edit_url.trim(),
      hvv_public_url: draft.hvv_public_url.trim() || null,
      token_base_url: draft.token_base_url.trim() || null,
      courts: draft.courts.split(",").map((court) => court.trim()).filter(Boolean),
    });
    if (saved) {
      setDirty(false);
    }
    setSaving(false);
  }

  function addCourt() {
    setDirty(true);
    setDraft((current) => {
      const courts = current.courts.split(",").map((court) => court.trim()).filter(Boolean);
      const courtNumbers = courts.map(courtNumber).filter((court) => court > 0);
      const nextCourt = courtNumbers.length > 0 ? Math.max(...courtNumbers) + 1 : 1;
      return {
        ...current,
        courts: [...courts, String(nextCourt)].join(", "),
      };
    });
  }

  return (
    <form className="config-panel" onSubmit={submit}>
      <div>
        <h3>Turnier</h3>
        <p>Lokale Konfiguration fuer Import, Courts und spaetere HVV-Anbindung.</p>
      </div>
      <label>
        Name
        <input value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} />
      </label>
      <label>
        HVV Edit-URL
        <input value={draft.hvv_edit_url} onChange={(event) => updateDraft({ hvv_edit_url: event.target.value })} />
      </label>
      <label>
        HVV Public-URL
        <input value={draft.hvv_public_url} onChange={(event) => updateDraft({ hvv_public_url: event.target.value })} />
      </label>
      <label>
        Token Basis-URL
        <input value={draft.token_base_url} onChange={(event) => updateDraft({ token_base_url: event.target.value })} placeholder="http://192.168.x.x:5173" />
      </label>
      <label>
        Courts
        <input value={draft.courts} onChange={(event) => updateDraft({ courts: event.target.value })} />
      </label>
      <div className="config-actions">
        <button type="button" className="secondary" onClick={addCourt}>Court hinzufuegen</button>
        <button type="button" className="secondary" onClick={onSyncGames} disabled={loading || syncing}>
          {syncing ? "Laedt..." : "HVV laden"}
        </button>
        <button type="button" className="secondary" onClick={onOpenCourtDisplay}>Court Anzeige</button>
        <button type="button" className="secondary" onClick={onSignOut}>Abmelden</button>
        <button type="submit" disabled={saving}>{saving ? "Speichert..." : "Turnier speichern"}</button>
      </div>
    </form>
  );
}

function CourtLinksPanel({
  courts,
  games,
  links,
  tokenBaseUrl,
  onCreateCourtLink,
  onReplaceCourtLink,
  onUnlockCourt,
}: {
  courts: Array<{ court: string; tournamentId: string }>;
  games: Game[];
  links: ScoreLink[];
  tokenBaseUrl?: string | null;
  onCreateCourtLink: (court: string, tournamentId: string) => Promise<void>;
  onReplaceCourtLink: (court: string, tournamentId: string, linkId: string) => Promise<void>;
  onUnlockCourt: (court: string) => Promise<void>;
}) {
  return (
    <section className="court-link-panel">
      <div className="subsection-heading">
        <div>
          <h3>Court-QR-Codes</h3>
          <p>Ein fester QR-Code pro Court. Das erste Geraet sperrt die Eingabe fuer das aktuelle Spiel.</p>
        </div>
      </div>
      <div className="court-link-grid">
        {courts.map((entry) => {
          const link = links.find((item) => item.court === entry.court);
          const currentGame = games.find((game) => game.court === entry.court && !isCompleted(game));
          const lockedGame = games.find((game) => game.court === entry.court && !isCompleted(game) && game.score_locked_by_device);
          const value = link?.token ? scoreUrl(link.token, tokenBaseUrl) : "";
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

function GamesEditor({
  games,
  tournament,
  onSave,
  onUnlockGame,
  onPrintPdf,
  printing,
}: {
  games: Game[];
  tournament: Tournament | null;
  onSave: (game: Game, draft: GameDraft) => Promise<boolean>;
  onUnlockGame: (gameId: string) => Promise<void>;
  onPrintPdf: (games: Game[], sheetType: PdfSheetType) => Promise<void>;
  printing: PdfSheetType | "";
}) {
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [selectedGameIds, setSelectedGameIds] = useState<string[]>([]);
  const [showCompletedGames, setShowCompletedGames] = useState(false);
  const sortedGames = useMemo(() => sortGames(games), [games]);
  const visibleGames = showCompletedGames ? sortedGames.filter(isCompleted) : sortedGames.filter((game) => !isCompleted(game));
  const selectedGames = games.filter((game) => selectedGameIds.includes(game.id));
  const allVisibleSelected = visibleGames.length > 0 && visibleGames.every((game) => selectedGameIds.includes(game.id));
  const courtOptions = useMemo(() => numericCourtOptions(games, tournament), [games, tournament]);
  const refereeOptions = useMemo(() => assignmentOptions(games), [games]);

  function toggleGame(gameId: string, checked: boolean) {
    setSelectedGameIds((current) => checked
      ? [...new Set([...current, gameId])]
      : current.filter((id) => id !== gameId));
  }

  function toggleAll(checked: boolean) {
    const visibleIds = visibleGames.map((game) => game.id);
    setSelectedGameIds((current) => checked
      ? [...new Set([...current, ...visibleIds])]
      : current.filter((id) => !visibleIds.includes(id)));
  }

  if (games.length === 0) {
    return <div className="empty">Noch keine Spiele vorhanden. Der naechste Schritt ist die Sync-Function fuer HVV.</div>;
  }

  return (
    <>
      <div className="pdf-toolbar">
        <div>
          <strong>{selectedGames.length}</strong> Spiele ausgewaehlt
        </div>
        <div className="actions">
          <button type="button" onClick={() => onPrintPdf(selectedGames, "normal")} disabled={selectedGames.length === 0 || Boolean(printing)}>
            {printing === "normal" ? "Erzeuge..." : "PDF DVV"}
          </button>
          <button type="button" className="secondary" onClick={() => onPrintPdf(selectedGames, "easy")} disabled={selectedGames.length === 0 || Boolean(printing)}>
            {printing === "easy" ? "Erzeuge..." : "PDF Easy"}
          </button>
        </div>
      </div>
      <label className="completed-toggle">
        <input
          type="checkbox"
          checked={showCompletedGames}
          onChange={(event) => setShowCompletedGames(event.target.checked)}
        />
        Nur abgeschlossene Spiele
      </label>
      <div className="mobile-admin-list" aria-label="Mobile Spieleverwaltung">
        {visibleGames.length === 0 ? (
          <div className="empty">{showCompletedGames ? "Keine abgeschlossenen Spiele." : "Keine offenen Spiele."}</div>
        ) : visibleGames.map((game) => (
          <MobileGameCard
            key={game.id}
            game={game}
            games={games}
            courtOptions={courtOptions}
            refereeOptions={refereeOptions}
            completedView={showCompletedGames}
            onSave={onSave}
            onEdit={setEditingGame}
            onUnlockGame={onUnlockGame}
          />
        ))}
      </div>
      <div className="table-wrap game-table-wrap">
        <table className="edit-table">
          <thead>
            <tr>
              <th className="select-cell">
                <input
                  type="checkbox"
                  aria-label="Alle Spiele fuer PDF auswaehlen"
                  checked={allVisibleSelected}
                  onChange={(event) => toggleAll(event.target.checked)}
                />
              </th>
              <th>Nr.</th>
              <th>Court</th>
              <th>Teams</th>
              <th>Schiedsrichter</th>
              <th>Ergebnis</th>
              <th>Status</th>
              <th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {visibleGames.map((game) => (
              <GameEditorRow
                key={game.id}
                game={game}
                games={games}
                selected={selectedGameIds.includes(game.id)}
                courtOptions={courtOptions}
                onSelect={(checked) => toggleGame(game.id, checked)}
                onSave={onSave}
                onEdit={setEditingGame}
                onUnlockGame={onUnlockGame}
              />
            ))}
          </tbody>
        </table>
      </div>
      {editingGame && (
        <GameEditDialog
          game={editingGame}
          games={games}
          courtOptions={courtOptions}
          refereeOptions={refereeOptions}
          onClose={() => setEditingGame(null)}
          onSave={async (draft) => {
            const saved = await onSave(editingGame, draft);
            if (saved) {
              setEditingGame(null);
            }
          }}
        />
      )}
    </>
  );
}

function MobileGameCard({
  game,
  games,
  courtOptions,
  refereeOptions,
  completedView,
  onSave,
  onEdit,
  onUnlockGame,
}: {
  game: Game;
  games: Game[];
  courtOptions: string[];
  refereeOptions: string[];
  completedView: boolean;
  onSave: (game: Game, draft: GameDraft) => Promise<boolean>;
  onEdit: (game: Game) => void;
  onUnlockGame: (gameId: string) => Promise<void>;
}) {
  const completed = isCompleted(game);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const refereeGroups = useMemo(() => prioritizedRefereeOptions(game, games, refereeOptions), [game, games, refereeOptions]);
  async function updateAssignment(key: "court" | "referee", value: string) {
    if ((game[key] ?? "") === value) {
      return;
    }
    setSaveState("saving");
    const saved = await onSave(game, { ...draftFromGame(game), [key]: value });
    setSaveState(saved ? "saved" : "idle");
    if (saved) {
      window.setTimeout(() => setSaveState("idle"), 1200);
    }
  }

  if (completedView) {
    return <CompletedMobileGameCard game={game} games={games} onEdit={onEdit} />;
  }

  return (
    <article className={mobileGameCardClass(game, saveState)}>
      <div className="mobile-game-assignment">
        <strong className="mobile-game-number">{game.number || "-"}</strong>
        <span className="mobile-assignment-label">Court</span>
        <div className="mobile-court-buttons" role="group" aria-label={`Court fuer Spiel ${game.number}`}>
          <button type="button" className={!game.court ? "active" : ""} onClick={() => updateAssignment("court", "")} disabled={saveState === "saving"}>-</button>
          {courtOptions.map((court) => (
            <button
              type="button"
              key={court}
              className={game.court === court ? "active" : ""}
              onClick={() => updateAssignment("court", court)}
              disabled={saveState === "saving"}
            >
              {court}
            </button>
          ))}
        </div>
        <select
          className="quick-select mobile-referee-select"
          value={resolvedReferee(game, games)}
          onChange={(event) => updateAssignment("referee", event.target.value)}
          aria-label={`Schiedsgericht fuer Spiel ${game.number}`}
          disabled={saveState === "saving"}
        >
          <option value="">Ohne Schiedsgericht</option>
          {refereeGroups.suggested.length > 0 && (
            <optgroup label="Vorschlaege">
              {refereeGroups.suggested.map((referee) => <option key={referee} value={referee}>{referee}</option>)}
            </optgroup>
          )}
          <optgroup label="Alle Teams">
            {refereeGroups.remaining.map((referee) => <option key={referee} value={referee}>{referee}</option>)}
          </optgroup>
        </select>
        {(completed || game.score_locked_by_device) && (
          <span className={completed ? "mobile-game-state done" : "mobile-game-state locked"}>
            {completed ? "fertig" : "läuft"}
          </span>
        )}
        <span className="mobile-save-state" aria-live="polite">{saveState === "saving" ? "Speichert..." : saveState === "saved" ? "Gespeichert" : ""}</span>
      </div>
      <div className="mobile-game-details">
        <span className="mobile-game-teams">
          <span><strong>A</strong>{game.team_a || "Team A offen"}</span>
          <span><strong>B</strong>{game.team_b || "Team B offen"}</span>
        </span>
        <button type="button" className="secondary mobile-more-button" onClick={() => onEdit(game)}>Mehr</button>
      </div>
      {(game.score_locked_by_device && !completed) && (
        <button type="button" className="secondary mobile-unlock-button" onClick={() => onUnlockGame(game.id)}>Eingabe entsperren</button>
      )}
    </article>
  );
}

function CompletedMobileGameCard({ game, games, onEdit }: { game: Game; games: Game[]; onEdit: (game: Game) => void }) {
  const result = completedResultParts(game);
  const winnerSide = completedWinnerSide(game);
  const referee = resolvedReferee(game, games);
  return (
    <article className="mobile-game-card completed result-card">
      <div className="mobile-result-head">
        <strong className="mobile-game-number">{game.number || "-"}</strong>
        <span>Court {courtLabel(game.court)}</span>
        <span>fertig</span>
      </div>
      <div className="mobile-result-team-list">
        <div className={winnerSide === "A" ? "mobile-result-team winner" : "mobile-result-team"}>
          <strong>A</strong>
          <span>{game.team_a || "Team A offen"}</span>
          <small className={setPointClass(game, 1, "A")}>{game.set1_team_a || "-"}</small>
          <small className={setPointClass(game, 2, "A")}>{game.set2_team_a || "-"}</small>
          <small className={setPointClass(game, 3, "A")}>{game.set3_team_a || "-"}</small>
          <b>{result.teamA}</b>
        </div>
        <div className={winnerSide === "B" ? "mobile-result-team winner" : "mobile-result-team"}>
          <strong>B</strong>
          <span>{game.team_b || "Team B offen"}</span>
          <small className={setPointClass(game, 1, "B")}>{game.set1_team_b || "-"}</small>
          <small className={setPointClass(game, 2, "B")}>{game.set2_team_b || "-"}</small>
          <small className={setPointClass(game, 3, "B")}>{game.set3_team_b || "-"}</small>
          <b>{result.teamB}</b>
        </div>
      </div>
      <div className="mobile-result-footer">
        <span>{referee ? `SR ${shortTeamLabel(referee, referee)}` : "SR -"}</span>
        <button type="button" className="secondary mobile-more-button" onClick={() => onEdit(game)}>Mehr</button>
      </div>
      {game.game_rating && game.game_rating !== "Normal" && <div className="mobile-result-rating">{game.game_rating}</div>}
    </article>
  );
}

function GameEditorRow({
  game,
  games,
  selected,
  courtOptions,
  onSelect,
  onSave,
  onEdit,
  onUnlockGame,
}: {
  game: Game;
  games: Game[];
  selected: boolean;
  courtOptions: string[];
  onSelect: (checked: boolean) => void;
  onSave: (game: Game, draft: GameDraft) => Promise<boolean>;
  onEdit: (game: Game) => void;
  onUnlockGame: (gameId: string) => Promise<void>;
}) {
  const completed = isCompleted(game);
  async function updateAssignment(key: "court" | "referee", value: string) {
    await onSave(game, { ...draftFromGame(game), [key]: value });
  }

  return (
    <tr className={game.dirty ? "dirty-row" : ""}>
      <td className="select-cell">
        <input
          type="checkbox"
          aria-label={`Spiel ${game.number || ""} fuer PDF auswaehlen`}
          checked={selected}
          onChange={(event) => onSelect(event.target.checked)}
        />
      </td>
      <td className="number-cell">
        <strong>{game.number}</strong>
        {game.game_date && <span>{game.game_date}</span>}
      </td>
      <td>
        <select className="quick-select court-select" value={game.court ?? ""} onChange={(event) => updateAssignment("court", event.target.value)} aria-label={`Court fuer Spiel ${game.number}`}>
          <option value="">-</option>
          {courtOptions.map((court) => <option key={court} value={court}>Court {court}</option>)}
        </select>
      </td>
      <td>
        <div className="team-summary">{game.team_a || "Team A offen"}</div>
        <div className="team-summary">{game.team_b || "Team B offen"}</div>
      </td>
      <td>
        {resolvedReferee(game, games) || <span className="muted-text">-</span>}
      </td>
      <td>
        <div>{formatResultWithSets(game) || "-"}</div>
        {completed && game.winner_team && <div className="muted-text">Sieger: {game.winner_team}</div>}
        {game.game_rating && <div className="muted-text">{game.game_rating}</div>}
        {game.score_locked_by_device && !completed && <div className="muted-text">Eingabe auf einem Geraet aktiv</div>}
      </td>
      <td>
        {game.dirty ? <span className="badge">geaendert</span> : <span className="muted-text">-</span>}
      </td>
      <td className="row-actions">
        <button type="button" onClick={() => onEdit(game)}>Bearbeiten</button>
        {game.score_locked_by_device && !completed && (
          <button type="button" className="secondary" onClick={() => onUnlockGame(game.id)}>Eingabe entsperren</button>
        )}
      </td>
    </tr>
  );
}

function GameEditDialog({
  game,
  games,
  courtOptions,
  refereeOptions,
  onClose,
  onSave,
}: {
  game: Game;
  games: Game[];
  courtOptions: string[];
  refereeOptions: string[];
  onClose: () => void;
  onSave: (draft: GameDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<GameDraft>(() => draftFromGame(game));
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"reset" | null>(null);
  const [correctionEditing, setCorrectionEditing] = useState(false);
  const completedOnOpen = isCompleted(game);
  const scoreFieldsLocked = completedOnOpen && !correctionEditing;
  const correctionActive = completedOnOpen && correctionEditing;
  const hasSetScores = hasAnySetScore(draft);
  const setValidation = validateManualResult(draft);
  const setScoresNeedValidation = hasSetScores && !scoreFieldsLocked && !isSpecialRating(draft.game_rating);
  const canSave = !saving && (!setScoresNeedValidation || setValidation.valid);
  const saveLabel = saving
    ? "Speichert..."
    : correctionActive
      ? "Korrektur speichern"
      : setScoresNeedValidation
        ? setValidation.valid ? "Ergebnis speichern" : "Ergebnis unvollständig"
        : "Speichern";

  function update<K extends keyof GameDraft>(key: K, value: GameDraft[K]) {
    setDraft((current) => withScoreAutomation({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) {
      return;
    }
    const nextDraft = withScoreAutomation(draft);
    const completed = nextDraft.completed || isSpecialRating(nextDraft.game_rating) || (hasAnySetScore(nextDraft) && validateManualResult(nextDraft).valid);
    setSaving(true);
    await onSave({ ...nextDraft, completed, game_rating: nextDraft.game_rating || "Normal" });
    setSaving(false);
  }

  async function resetCompleted() {
    setConfirmAction(null);
    setSaving(true);
    await onSave({ ...draft, completed: false, game_rating: draft.game_rating === "Normal" ? "" : draft.game_rating });
    setSaving(false);
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="game-edit-dialog" onSubmit={submit}>
        <div className="dialog-heading">
          <h3>Spiel bearbeiten</h3>
          <button type="button" className="secondary" onClick={onClose}>Schließen</button>
        </div>

        <div className="dialog-field">
          <div className="dialog-label">Spiel</div>
          <div className="game-teams-panel">
            <div><strong>Team A</strong><span>{game.team_a || "Team A offen"}</span></div>
            <div><strong>Team B</strong><span>{game.team_b || "Team B offen"}</span></div>
            {game.referee && <div><strong>Schiedsrichter</strong><span>{resolvedReferee(game, games)}</span></div>}
          </div>
        </div>

        <label className="dialog-field">
          <span className="dialog-label">Court</span>
          <select value={draft.court ?? ""} onChange={(event) => update("court", event.target.value)}>
            <option value="">Nicht zugewiesen</option>
            {courtOptions.map((court) => <option key={court} value={court}>Court {court}</option>)}
          </select>
        </label>

        <label className="dialog-field">
          <span className="dialog-label">Schiedsgericht</span>
          <select value={draft.referee ?? ""} onChange={(event) => update("referee", event.target.value)}>
            <option value="">Nicht zugewiesen</option>
            {refereeOptions.map((referee) => <option key={referee} value={referee}>{referee}</option>)}
          </select>
        </label>

        <label className="dialog-field">
          <span className="dialog-label">Spielwertung</span>
          <select value={draft.game_rating ?? ""} onChange={(event) => update("game_rating", event.target.value)} disabled={scoreFieldsLocked}>
            {gameRatingOptions.map((option) => (
              <option key={option || "empty"} value={option}>{option || "Wertung"}</option>
            ))}
          </select>
        </label>

        <div className={scoreFieldsLocked ? "dialog-field correction-field locked" : "dialog-field correction-field"}>
          <div className="dialog-label">Satzpunkte</div>
          <div className="score-correction-box">
            {completedOnOpen && (
              <div className="admin-correction-header">
                <div>
                  <strong>{correctionEditing ? "Admin-Korrektur" : "Vom Schiedsgericht erfasst"}</strong>
                  <span>{correctionEditing ? "Satzwerte können jetzt bewusst angepasst werden." : "Satzwerte sind geschützt. Zum Ändern zuerst Korrektur starten."}</span>
                </div>
                {!correctionEditing && (
                  <button type="button" className="secondary" onClick={() => setCorrectionEditing(true)} disabled={saving}>
                    Korrektur bearbeiten
                  </button>
                )}
              </div>
            )}
            <div className="score-edit-grid">
              <div></div>
              <strong>Team A</strong>
              <strong>Team B</strong>
              <span>1. Satz</span>
              <ScoreInput value={draft.set1_team_a} onChange={(value) => update("set1_team_a", value)} label="Satz 1 Team A" disabled={scoreFieldsLocked} />
              <ScoreInput value={draft.set1_team_b} onChange={(value) => update("set1_team_b", value)} label="Satz 1 Team B" disabled={scoreFieldsLocked} />
              <span>2. Satz</span>
              <ScoreInput value={draft.set2_team_a} onChange={(value) => update("set2_team_a", value)} label="Satz 2 Team A" disabled={scoreFieldsLocked} />
              <ScoreInput value={draft.set2_team_b} onChange={(value) => update("set2_team_b", value)} label="Satz 2 Team B" disabled={scoreFieldsLocked} />
              <span>3. Satz</span>
              <ScoreInput value={draft.set3_team_a} onChange={(value) => update("set3_team_a", value)} label="Satz 3 Team A" disabled={scoreFieldsLocked} />
              <ScoreInput value={draft.set3_team_b} onChange={(value) => update("set3_team_b", value)} label="Satz 3 Team B" disabled={scoreFieldsLocked} />
            </div>
            {!scoreFieldsLocked && setScoresNeedValidation && !setValidation.valid && (
              <div className="manual-result-validation admin-result-validation" aria-live="polite">
                {setValidation.errors.length > 0
                  ? setValidation.errors.map((error) => <span key={error} className="error-text">{error}</span>)
                  : <span className="error-text">Satzergebnis ist noch unvollständig.</span>}
              </div>
            )}
          </div>
        </div>

        <div className="dialog-field">
          <div className="dialog-label">Automatik</div>
          <div className="result-preview">
            <span>Ergebnis: <strong>{draft.result || "-"}</strong></span>
            <span>Sieger: <strong>{draft.winner_team || "-"}</strong></span>
            <span>Status: <strong>{isCompletedDraft(draft) ? "abgeschlossen" : "offen"}</strong></span>
          </div>
        </div>

        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>Abbrechen</button>
          {isCompletedDraft(draft) && <button type="button" className="secondary" onClick={() => setConfirmAction("reset")} disabled={saving}>Abschluss zurücksetzen</button>}
          <button type="submit" disabled={!canSave}>{saveLabel}</button>
        </div>
      </form>
      {confirmAction === "reset" && (
        <AppDialog
          title="Abschluss zurücksetzen?"
          message="Das Spiel erscheint danach wieder als offen."
          secondaryLabel="Abbrechen"
          primaryLabel="Zurücksetzen"
          onSecondary={() => setConfirmAction(null)}
          onPrimary={resetCompleted}
          onClose={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}

function ScoreInput({ value, label, disabled = false, onChange }: { value: string | null; label: string; disabled?: boolean; onChange: (value: string) => void }) {
  return <input inputMode="numeric" value={value ?? ""} onChange={(event) => onChange(event.target.value)} aria-label={label} disabled={disabled} />;
}

function AppDialog({
  title,
  message,
  secondaryLabel,
  primaryLabel,
  onSecondary,
  onPrimary,
  onClose,
}: {
  title: string;
  message: string;
  secondaryLabel: string;
  primaryLabel: string;
  onSecondary: () => void;
  onPrimary: () => void;
  onClose: () => void;
}) {
  return (
    <div className="app-dialog-backdrop" role="presentation">
      <section className="app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title">
        <h3 id="app-dialog-title">{title}</h3>
        <div className="app-dialog-message">
          {message.split("\n").map((line, index) => <p key={`${index}-${line}`}>{line}</p>)}
        </div>
        <div className="app-dialog-actions">
          <button type="button" className="secondary" onClick={onSecondary}>{secondaryLabel}</button>
          <button type="button" onClick={onPrimary}>{primaryLabel}</button>
        </div>
        <button type="button" className="app-dialog-close" onClick={onClose} aria-label="Dialog schließen">×</button>
      </section>
    </div>
  );
}

function LinkOutput({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function copy() {
    if (await copyText(value, inputRef.current)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  }

  return (
    <div className="link-output-wrap">
      <div className="link-output">
        <input ref={inputRef} value={value} readOnly />
        <button type="button" onClick={copy}>{copied ? "Kopiert" : "Kopieren"}</button>
      </div>
      <QrCode value={value} />
    </div>
  );
}

function CompactLink({ value, hideQr = false }: { value: string; hideQr?: boolean }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function copy() {
    if (await copyText(value, inputRef.current)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    }
  }

  return (
    <div className={hideQr ? "token-link-cell no-qr" : "token-link-cell"}>
      <div className="compact-link">
        <input ref={inputRef} value={value} readOnly />
        <button type="button" className="secondary" onClick={copy}>{copied ? "Kopiert" : "Kopieren"}</button>
      </div>
      {!hideQr && <QrCode value={value} compact />}
    </div>
  );
}

async function copyText(value: string, input: HTMLInputElement | null) {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall back to selecting the field below. LAN dev URLs are often not secure contexts.
  }

  if (!input) {
    return false;
  }

  input.focus();
  input.select();
  input.setSelectionRange(0, value.length);

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  }
}

function scoreUrl(token: string, baseUrl?: string | null) {
  const url = new URL(baseUrl && baseUrl.trim() ? baseUrl.trim() : window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("token", token);
  return url.toString();
}

function formatSyncTime(date: Date) {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function displayUrl() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("view", "courts");
  return url.toString();
}

function singleCourtUrl(court: number) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("view", "courts");
  url.searchParams.set("court", String(court));
  return url.toString();
}

function displayCourts(tournament: Tournament | null, games: Game[] = []) {
  const configured = tournament?.courts
    .map((court) => courtNumber(court))
    .filter((court) => court > 0);
  const gameCourts = games
    .map((game) => courtNumber(game.court))
    .filter((court) => court > 0);
  const courts = [...new Set([...(configured ?? []), ...gameCourts])];
  if (courts.length === 0) {
    return [1, 2, 3, 4];
  }
  return courts.sort((left, right) => left - right);
}

function sortGames(games: Game[]) {
  return [...games].sort((left, right) => gameNumberSortKey(left.number) - gameNumberSortKey(right.number) || left.number.localeCompare(right.number, "de"));
}

function numericCourtOptions(games: Game[], tournament: Tournament | null = null): string[] {
  const configuredCourts = tournament?.courts
    .map((court) => court.trim())
    .filter((court) => courtNumber(court) > 0) ?? [];
  const gameCourts = games
    .map((game) => courtLabel(game.court))
    .filter((court): court is string => court !== "-");
  const courts = [...new Set([...configuredCourts, ...gameCourts])];
  const sorted = courts.sort((left, right) => Number.parseInt(left, 10) - Number.parseInt(right, 10));
  return sorted.length > 0 ? sorted : ["1", "2", "3", "4"];
}

function assignmentOptions(games: Game[]): string[] {
  const values = games.flatMap((game) => [game.team_a, game.team_b, game.referee])
    .map((value) => (value ?? "").trim())
    .filter((value): value is string => Boolean(value) && value !== "(Freilos)" && !isLegacyPreviousGameReferee(value));
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "de", { numeric: true }));
}

function prioritizedRefereeOptions(game: Game, games: Game[], allOptions: string[]) {
  const current = resolvedReferee(game, games);
  const currentNumber = gameNumberSortKey(game.number);
  const sameCourtNeighbours = games
    .filter((candidate) => candidate.id !== game.id && candidate.court === game.court)
    .sort((left, right) => Math.abs(gameNumberSortKey(left.number) - currentNumber) - Math.abs(gameNumberSortKey(right.number) - currentNumber))
    .slice(0, 2);
  const suggestedValues = [current, game.referee, ...sameCourtNeighbours.flatMap((candidate) => [candidate.team_a, candidate.team_b, candidate.referee])];
  const suggested = uniqueAssignmentValues(suggestedValues)
    .filter((value) => allOptions.includes(value) && value !== game.team_a && value !== game.team_b)
    .slice(0, 5);
  const remaining = allOptions.filter((value) => !suggested.includes(value));
  return { suggested, remaining };
}

function uniqueAssignmentValues(values: Array<string | null | undefined>) {
  return [...new Set(values
    .map((value) => (value ?? "").trim())
    .filter((value): value is string => Boolean(value) && value !== "(Freilos)" && !isLegacyPreviousGameReferee(value)))];
}

function mobileGameCardClass(game: Game, saveState: "idle" | "saving" | "saved") {
  return [
    "mobile-game-card",
    `court-${courtLabel(game.court).toLowerCase()}`,
    isCompleted(game) ? "completed" : "",
    game.score_locked_by_device && !isCompleted(game) ? "locked" : "",
    game.dirty ? "dirty-row" : "",
    saveState === "saving" ? "saving" : "",
    saveState === "saved" ? "saved" : "",
  ].filter(Boolean).join(" ").replace("court--", "court-none");
}

function teamOptions(games: Game[]): string[] {
  const values = games.flatMap((game) => [game.team_a, game.team_b])
    .map((value) => (value ?? "").trim())
    .filter((value): value is string => Boolean(value) && value !== "(Freilos)");
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "de", { numeric: true }));
}

function resolvedReferee(game: Game, games: Game[]) {
  const referee = game.referee ?? "";
  return isLegacyPreviousGameReferee(referee) ? "" : referee;
}

function isLegacyPreviousGameReferee(value: string) {
  return value === "__previous_winner__" || value === "__previous_loser__";
}

function gameNumberSortKey(number: string | null) {
  const match = (number ?? "").match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : Number.MAX_SAFE_INTEGER;
}

function courtNumber(court: string | null) {
  const normalized = (court ?? "").trim();
  return /^\d+$/.test(normalized) ? Number.parseInt(normalized, 10) : -1;
}

function isAssignedCourt(court: string | null | undefined) {
  return courtNumber(court ?? null) > 0;
}

function courtLabel(court: string | null | undefined) {
  return isAssignedCourt(court) ? (court ?? "").trim() : "-";
}

function isCompleted(game: Game) {
  return Boolean(game.completed || isSpecialRating(game.game_rating));
}

function isCompletedDraft(draft: GameDraft) {
  return Boolean(draft.completed || isSpecialRating(draft.game_rating));
}

function hasAnySetScore(draft: GameDraft) {
  return Boolean(
    draft.set1_team_a || draft.set1_team_b
    || draft.set2_team_a || draft.set2_team_b
    || draft.set3_team_a || draft.set3_team_b,
  );
}

function isSpecialRating(rating: string | null) {
  const normalized = (rating ?? "").trim();
  return Boolean(normalized && normalized !== "Normal");
}

function teamLine(game: Game) {
  return `${game.team_a || "Team A offen"} vs. ${game.team_b || "Team B offen"}`;
}

function playersForTeam(team: string | null, players?: string[]) {
  if (players && players.length >= 2) {
    return players.slice(0, 2);
  }
  const teamName = team || "Team";
  return [`${teamName} Spieler 1`, `${teamName} Spieler 2`];
}

function formatSetScores(game: Game) {
  return [
    [game.set1_team_a, game.set1_team_b],
    [game.set2_team_a, game.set2_team_b],
    [game.set3_team_a, game.set3_team_b],
  ]
    .filter(([teamA, teamB]) => teamA || teamB)
    .map(([teamA, teamB]) => `${teamA ?? ""}:${teamB ?? ""}`)
    .join(",");
}

function formatResultWithSets(game: Game) {
  const result = resultFromCompletedSetScores(game) || game.result?.trim() || "";
  const setScores = formatSetScores(game);
  if (result && setScores) {
    return `${result} (${setScores})`;
  }
  if (result) {
    return result;
  }
  if (setScores) {
    return `(${setScores})`;
  }
  return "";
}

function completedWinnerSide(game: Game): TeamKey | "" {
  if (game.winner_team === game.team_a || game.winner_team === "1") {
    return "A";
  }
  if (game.winner_team === game.team_b || game.winner_team === "2") {
    return "B";
  }
  const index = winnerIndexFromScores(game);
  return index === 1 ? "A" : index === 2 ? "B" : "";
}

function completedResultParts(game: Game) {
  const result = resultFromCompletedSetScores(game) || game.result?.trim() || "";
  const match = result.match(/(\d+)\s*[:-]\s*(\d+)/);
  return {
    teamA: match?.[1] ?? "-",
    teamB: match?.[2] ?? "-",
  };
}

function setPointClass(game: Game, setNumber: 1 | 2 | 3, team: TeamKey) {
  const score = scoreForSet(draftFromGame(game), setNumber);
  if (score.A === score.B) {
    return "";
  }
  return score[team] > score[team === "A" ? "B" : "A"] ? "set-winner" : "";
}

function winnerIndexFromScores(game: Game) {
  const computed = resultFromCompletedSetScores(game);
  const source = computed || game.result || "";
  const match = source.match(/(\d+)\s*[:-]\s*(\d+)/);
  if (!match) {
    return 0;
  }
  const teamA = Number.parseInt(match[1], 10);
  const teamB = Number.parseInt(match[2], 10);
  if (teamA > teamB) {
    return 1;
  }
  if (teamB > teamA) {
    return 2;
  }
  return 0;
}

function liveScoreParts(game: Game) {
  const setPairs = [
    [game.set1_team_a, game.set1_team_b],
    [game.set2_team_a, game.set2_team_b],
    [game.set3_team_a, game.set3_team_b],
  ];
  const sets = resultFromCompletedSetScores(game) || "0:0";
  const current = [...setPairs].reverse().find(([teamA, teamB]) => {
    const scoreA = parseScore(teamA);
    const scoreB = parseScore(teamB);
    if (scoreA === null && scoreB === null) {
      return false;
    }
    if (scoreA !== null && scoreB !== null && isPlausibleSetResult({ A: scoreA, B: scoreB })) {
      return false;
    }
    return true;
  }) ?? ["0", "0"];
  return {
    sets,
    pointsA: current[0] || "0",
    pointsB: current[1] || "0",
  };
}

function currentSetNumber(game: Game): 1 | 2 | 3 {
  if (game.set3_team_a || game.set3_team_b) {
    return 3;
  }
  if (game.set2_team_a || game.set2_team_b) {
    return 2;
  }
  return 1;
}

function shortTeamLabel(value: string | null | undefined, fallback: string) {
  const label = value?.replace(/\s*\(\d+\)\s*$/, "").trim() || fallback;
  return label.replace(/\s+-\s+/g, " / ");
}

function winnerIndex(game: Game) {
  if (game.winner_team) {
    if (game.winner_team === game.team_a || game.winner_team === "1") {
      return 1;
    }
    if (game.winner_team === game.team_b || game.winner_team === "2") {
      return 2;
    }
  }

  const result = game.result ?? "";
  const match = result.match(/(\d+)\s*[:-]\s*(\d+)/);
  if (!match) {
    return 0;
  }

  const teamA = Number.parseInt(match[1], 10);
  const teamB = Number.parseInt(match[2], 10);
  if (teamA > teamB) {
    return 1;
  }
  if (teamB > teamA) {
    return 2;
  }
  return 0;
}

createRoot(document.getElementById("root")!).render(<App />);
