import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createTournament,
  createScoreLink as createScoreLinkData,
  deleteAdminUser,
  deleteTournament,
  disableScoreLink,
  getHvvCredentialsStatus,
  getTournament,
  listTournaments,
  inviteAdminUser,
  listGames,
  listHvvTournaments,
  listAdminUsers,
  listScoreLinks,
  listCourtLocks,
  pushDirtyGamesToHvv,
  saveGame as saveGameData,
  saveTournament,
  setHvvCredentials,
  syncGamesFromHvv,
  unlockScoreGame,
  unlockScoreCourt,
  updateAdminUser,
  updateGameDisplayOrders,
  validateAdminSession,
} from "../dataApi";
import type { HvvTournamentOption } from "../dataApi";
import { draftFromGame } from "../scoreLogic";
import type { PdfSheetType } from "../pdfExport";
import type { AdminRole, AdminUser, AppSession, CourtLock, Game, GameDraft, ScoreLink, Tournament } from "../types";
import type { AdminTab } from "../workflowTypes";
import { CourtLinksPanel, HvvCredentialsDialog, HvvProgressDialog, HvvTournamentDialog, sortHvvTournamentsByDate, TournamentPanel, AdminUsersPanel } from "./dashboardSections";
import { GamesEditor, isAssignedCourt, isCompleted, resolvedReferee } from "./GamesEditor";
import { AppDialog, formatSyncTime, LinkOutput, scoreUrl } from "./shared";
import { normalizeStreamUrl } from "../stream";

type PendingHvvAction = "sync" | "selectTournament" | "importTournament" | "pushDirtyGames" | null;

function courtEntries(games: Game[], tournament: Tournament | null) {
  const configuredCourts = tournament?.courts
    .filter(isAssignedCourt)
    .map((court) => ({ court, tournamentId: tournament.id })) ?? [];
  const gameCourts = games
    .filter((game) => isAssignedCourt(game.court) && game.tournament_id)
    .map((game) => ({ court: game.court!, tournamentId: game.tournament_id }));
  const entries = [...configuredCourts, ...gameCourts];
  return entries
    .filter((entry, index) => entries.findIndex((item) => item.court === entry.court) === index)
    .sort((left, right) => Number(left.court) - Number(right.court));
}

export function AdminDashboard({ session }: { session: AppSession }) {
  const [games, setGames] = useState<Game[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [scoreLinks, setScoreLinks] = useState<ScoreLink[]>([]);
  const [courtLocks, setCourtLocks] = useState<CourtLock[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pushingHvv, setPushingHvv] = useState(false);
  const [printing, setPrinting] = useState<PdfSheetType | "">("");
  const [activeTab, setActiveTab] = useState<AdminTab>("games");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [linkText, setLinkText] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState("");
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [pendingSyncOverwriteCourts, setPendingSyncOverwriteCourts] = useState<boolean | null>(null);
  const [pendingHvvAction, setPendingHvvAction] = useState<PendingHvvAction>(null);
  const [pendingHvvTournamentSource, setPendingHvvTournamentSource] = useState("");
  const [hvvTournamentSelectionMode, setHvvTournamentSelectionMode] = useState<"update" | "create">("update");
  const [showHvvCredentialsDialog, setShowHvvCredentialsDialog] = useState(false);
  const [showHvvTournamentDialog, setShowHvvTournamentDialog] = useState(false);
  const [hvvTournamentOptions, setHvvTournamentOptions] = useState<HvvTournamentOption[]>([]);
  const [loadingHvvTournaments, setLoadingHvvTournaments] = useState(false);
  const [hvvProgressMessage, setHvvProgressMessage] = useState("");
  const isSuperadmin = session.user.role === "superadmin";
  const dashboardLoads = useRef(0);

  const loadDashboard = useCallback(async (options: { silent?: boolean; initial?: boolean } = {}) => {
    if (options.silent && dashboardLoads.current > 0) return;
    dashboardLoads.current += 1;
    const silent = options.silent ?? false;
    if (options.initial) {
      setLoading(true);
    }
    if (!silent) {
      setError("");
      setMessage("");
    }

    try {
      if (isSuperadmin && !await validateAdminSession()) return;
      const tournamentList = await listTournaments();
      const selectedId = selectedTournamentId && tournamentList.some((item) => item.id === selectedTournamentId)
        ? selectedTournamentId
        : tournamentList[0]?.id ?? "";
      if (selectedId !== selectedTournamentId) {
        setSelectedTournamentId(selectedId);
      }
      setTournaments(tournamentList);

      if (!selectedId) {
        setGames([]);
        setTournament(null);
        setScoreLinks([]);
        setCourtLocks([]);
        setAdminUsers(isSuperadmin ? await listAdminUsers() : []);
        return;
      }

      const [gameData, tournamentData, linkData, lockData, adminsData] = await Promise.all([
        listGames(selectedId),
        getTournament(selectedId),
        listScoreLinks(selectedId),
        listCourtLocks(selectedId),
        isSuperadmin ? listAdminUsers() : Promise.resolve([]),
      ]);
      setGames(gameData);
      setTournament(tournamentData);
      setScoreLinks(linkData);
      setCourtLocks(lockData);
      setAdminUsers(adminsData);
      setLastSyncedAt(formatSyncTime(new Date()));
    } catch (gamesError) {
      if (!silent) {
        setError(gamesError instanceof Error ? gamesError.message : "Dashboard konnte nicht geladen werden.");
      }
    } finally {
      dashboardLoads.current -= 1;
      if (options.initial) {
        setLoading(false);
      }
    }
  }, [isSuperadmin, selectedTournamentId]);

  useEffect(() => {
    loadDashboard({ initial: true });
    const onFocus = () => { void loadDashboard({ silent: true }); };
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(() => {
      loadDashboard({ silent: true });
    }, 10000);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadDashboard]);

  async function saveTournamentDraft(nextTournament: Tournament, options: { silent?: boolean; successMessage?: string } = {}) {
    if (!options.silent) {
      setError("");
      setMessage("");
    }

    try {
      const saved = await saveTournament(nextTournament);
      setTournament(saved);
      setTournaments((current) => current.map((item) => item.id === saved.id ? saved : item));
      if (!options.silent) {
        setMessage(options.successMessage ?? "Turnierdaten gespeichert.");
      }
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

  async function reorderGames(updates: Array<{ gameId: string; displayOrder: number }>) {
    setError("");
    setMessage("");

    try {
      const updatedGames = await updateGameDisplayOrders(updates);
      setGames((current) => {
        const updatedById = new Map(updatedGames.map((game) => [game.id, game]));
        return current.map((game) => updatedById.get(game.id) ?? game);
      });
      setMessage("Spielreihenfolge gespeichert.");
      return true;
    } catch (reorderError) {
      setError(reorderError instanceof Error ? reorderError.message : "Spielreihenfolge konnte nicht gespeichert werden.");
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
      setLinkText(scoreUrl(data.token));
      setScoreLinks(await listScoreLinks(game.tournament_id));
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
      await createScoreLinkData({ tournamentId, court });
      setScoreLinks(await listScoreLinks(tournamentId));
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
      await unlockScoreCourt(tournamentId, court);
      await createScoreLinkData({ tournamentId, court });
      setScoreLinks(await listScoreLinks(tournamentId));
      setGames(await listGames(tournamentId));
      setMessage(`QR-Code fuer Court ${court} ersetzt.`);
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "Court-Link konnte nicht ersetzt werden.");
    }
  }

  const dirtyCount = useMemo(() => games.filter((game) => game.dirty).length, [games]);
  const courts = useMemo(() => courtEntries(games, tournament), [games, tournament]);
  const courtLinks = useMemo(() => scoreLinks.filter((link) => link.court && !link.game_id && !link.disabled_at), [scoreLinks]);

  async function unlockGame(gameId: string) {
    setError("");
    setMessage("");
    try {
      await unlockScoreGame(gameId);
      setGames(await listGames(selectedTournamentId));
      setScoreLinks(await listScoreLinks(selectedTournamentId));
      setMessage("Eingabesperre geloest.");
    } catch (unlockError) {
      setError(unlockError instanceof Error ? unlockError.message : "Eingabesperre konnte nicht geloest werden.");
    }
  }

  async function unlockCourt(court: string) {
    setError("");
    setMessage("");
    try {
      await unlockScoreCourt(selectedTournamentId, court);
      const [gameData, lockData] = await Promise.all([listGames(selectedTournamentId), listCourtLocks(selectedTournamentId)]);
      setGames(gameData);
      setCourtLocks(lockData);
      setMessage(`Court ${court} wurde entsperrt.`);
    } catch (unlockError) {
      setError(unlockError instanceof Error ? unlockError.message : "Court konnte nicht entsperrt werden.");
    }
  }

  async function saveCourtStream(court: string, value: string) {
    if (!tournament) {
      return;
    }
    setError("");
    setMessage("");
    try {
      const normalizedUrl = normalizeStreamUrl(value);
      const courtStreams = { ...(tournament.court_streams ?? {}) };
      if (normalizedUrl) {
        courtStreams[court] = normalizedUrl;
      } else {
        delete courtStreams[court];
      }
      const saved = await saveTournament({ ...tournament, court_streams: courtStreams });
      setTournament(saved);
      setTournaments((current) => current.map((item) => item.id === saved.id ? saved : item));
      setMessage(normalizedUrl ? `Livestream für Court ${court} gespeichert.` : `Livestream für Court ${court} entfernt.`);
    } catch (streamError) {
      setError(streamError instanceof Error ? streamError.message : "Livestream konnte nicht gespeichert werden.");
    }
  }

  async function syncGames(overwriteCourts: boolean) {
    setShowSyncDialog(false);
    if (!selectedTournamentId) {
      setError("Bitte zuerst ein Turnier auswaehlen oder anlegen.");
      return;
    }
    if (!getHvvCredentialsStatus().active) {
      setPendingHvvAction("sync");
      setPendingSyncOverwriteCourts(overwriteCourts);
      setShowHvvCredentialsDialog(true);
      return;
    }
    setSyncing(true);
    setHvvProgressMessage("Spiele werden aus HVV geladen. Das kann einen Moment dauern.");
    setError("");
    setMessage("");
    try {
      await loadGamesFromHvv(selectedTournamentId, overwriteCourts);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Spiele konnten nicht geladen werden.");
    } finally {
      setSyncing(false);
      setHvvProgressMessage("");
    }
  }

  async function loadGamesFromHvv(tournamentId: string, overwriteCourts: boolean) {
    const result = await syncGamesFromHvv({ tournamentId, overwriteCourts });
    const [gameData, tournamentData, linkData] = await Promise.all([
      listGames(tournamentId),
      getTournament(tournamentId),
      listScoreLinks(tournamentId),
    ]);
    setGames(gameData);
    setTournament(tournamentData);
    setTournaments((current) => current.map((item) => item.id === tournamentData.id ? tournamentData : item));
    setScoreLinks(linkData);
    setLastSyncedAt(formatSyncTime(new Date()));
    setMessage(`${result.imported} Spiele geladen. ${result.message}`);
  }

  async function continuePendingSync() {
    const overwriteCourts = pendingSyncOverwriteCourts;
    setPendingSyncOverwriteCourts(null);
    setShowHvvCredentialsDialog(false);
    if (pendingHvvAction === "selectTournament" || pendingHvvAction === "importTournament") {
      const source = pendingHvvTournamentSource;
      const mode = pendingHvvAction === "importTournament" ? "create" : "update";
      setPendingHvvTournamentSource("");
      setPendingHvvAction(null);
      await openHvvTournamentSelection(source, mode);
    } else if (overwriteCourts !== null) {
      setPendingHvvAction(null);
      await syncGames(overwriteCourts);
    } else if (pendingHvvAction === "pushDirtyGames") {
      setPendingHvvAction(null);
      await pushDirtyGames();
    }
  }

  async function openHvvTournamentSelection(sourceOverride?: string, mode: "update" | "create" = "update") {
    if (mode === "update" && !tournament) {
      return;
    }
    const source = sourceOverride?.trim() || tournament?.hvv_edit_url.trim() || "";
    if (!source) {
      setError("Bitte zuerst die HVV URL eintragen.");
      return;
    }
    if (!getHvvCredentialsStatus().active) {
      setPendingHvvAction(mode === "create" ? "importTournament" : "selectTournament");
      setPendingHvvTournamentSource(source);
      setShowHvvCredentialsDialog(true);
      return;
    }

    setHvvTournamentSelectionMode(mode);
    setLoadingHvvTournaments(true);
    setHvvProgressMessage(mode === "create" ? "HVV-Turniere werden geladen." : "HVV-Turnierliste wird geladen.");
    setError("");
    setMessage("");
    try {
      const options = await listHvvTournaments(source);
      setHvvTournamentOptions(sortHvvTournamentsByDate(options));
      setShowHvvTournamentDialog(true);
      if (options.length === 0) {
        setError("In der HVV-Uebersicht wurden keine Turniere gefunden.");
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "HVV-Turniere konnten nicht geladen werden.");
    } finally {
      setLoadingHvvTournaments(false);
      setHvvProgressMessage("");
    }
  }

  async function selectHvvTournament(option: HvvTournamentOption) {
    setShowHvvTournamentDialog(false);
    setError("");
    setMessage("");
    const nextTournament = {
      name: option.name,
      hvv_edit_url: option.detail_url,
      hvv_public_url: option.schedule_url || null,
      hvv_turnier_id: option.hvv_turnier_id || null,
      hvv_veranstaltung_id: option.hvv_veranstaltung_id || null,
      hvv_type: option.hvv_type || null,
      hvv_gender: option.hvv_gender || null,
      tournament_date: option.tournament_date || null,
      location: option.location || null,
      token_base_url: null,
      courts: tournament?.courts ?? [],
      court_streams: tournament?.court_streams ?? {},
    };

    if (hvvTournamentSelectionMode === "create" || !tournament) {
      let created: Tournament;
      try {
        setHvvProgressMessage("Turnier wird angelegt.");
        created = await createTournament(nextTournament);
        setTournaments((current) => [...current, created].sort((left, right) => left.name.localeCompare(right.name, "de")));
        setTournament(created);
        setSelectedTournamentId(created.id);
        setGames([]);
        setScoreLinks([]);
        setActiveTab("settings");
      } catch (createError) {
        setError(createError instanceof Error ? createError.message : "HVV-Turnier konnte nicht importiert werden.");
        return;
      } finally {
        setHvvProgressMessage("");
      }

      try {
        setSyncing(true);
        setHvvProgressMessage("Spiele werden aus HVV importiert. Das kann einen Moment dauern.");
        await loadGamesFromHvv(created.id, true);
        setActiveTab("games");
      } catch (syncError) {
        setError(syncError instanceof Error ? syncError.message : "HVV-Turnier importiert, aber Spiele konnten nicht geladen werden.");
      } finally {
        setSyncing(false);
        setHvvProgressMessage("");
      }
      return;
    }

    const saved = await saveTournamentDraft({ ...tournament, ...nextTournament });
    if (saved) {
      try {
        setSyncing(true);
        setHvvProgressMessage("Spiele werden aus HVV geladen. Das kann einen Moment dauern.");
        await loadGamesFromHvv(tournament.id, true);
      } catch (syncError) {
        setError(syncError instanceof Error ? syncError.message : "Spiele konnten nicht geladen werden.");
      } finally {
        setSyncing(false);
        setHvvProgressMessage("");
      }
    }
  }

  async function pushDirtyGames() {
    if (!tournament) {
      return;
    }
    if (!getHvvCredentialsStatus().active) {
      setError("");
      setMessage("");
      setPendingHvvAction("pushDirtyGames");
      setShowHvvCredentialsDialog(true);
      return;
    }
    setPushingHvv(true);
    setHvvProgressMessage("Änderungen werden an HVV übertragen.");
    setError("");
    setMessage("");
    try {
      const result = await pushDirtyGamesToHvv(tournament.id);
      await loadDashboard();
      if (result.failed > 0) {
        const failed = result.results
          .filter((item) => !item.ok)
          .map((item) => `Spiel ${item.number}: ${item.error}`)
          .join("; ");
        setError(`${result.sent} Spiele an HVV uebertragen, ${result.failed} fehlgeschlagen. ${failed}`);
      } else {
        setMessage(`${result.sent} geaenderte Spiele an HVV uebertragen.`);
      }
    } catch (pushError) {
      setError(pushError instanceof Error ? pushError.message : "Geaenderte Spiele konnten nicht an HVV uebertragen werden.");
    } finally {
      setPushingHvv(false);
      setHvvProgressMessage("");
    }
  }

  async function inviteAdmin(email: string, role: AdminRole) {
    setError("");
    setMessage("");
    try {
      const result = await inviteAdminUser({ email, role });
      setAdminUsers(await listAdminUsers());
      setMessage(result.inviteEmailSent
        ? `Einladung an ${email} gesendet.`
        : `Admin ${email} angelegt, aber die E-Mail wurde nicht gesendet. Du kannst ihn manuell freischalten.`);
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

  async function updateAdmin(admin: AdminUser, action: "confirm" | "resendInvite" | "updateRole" | "setSuspended", params: { role?: AdminRole; suspended?: boolean } = {}) {
    setError("");
    setMessage("");
    try {
      await updateAdminUser({ userId: admin.user_id, action, ...params });
      setAdminUsers(await listAdminUsers());
      const label = admin.email || admin.user_id;
      const messages: Record<typeof action, string> = {
        confirm: `E-Mail fuer ${label} bestaetigt. Das Passwort muss weiterhin ueber den Einladungslink gesetzt werden.`,
        resendInvite: `Einladung an ${label} erneut gesendet.`,
        updateRole: `Rolle fuer ${label} aktualisiert.`,
        setSuspended: params.suspended ? `Admin ${label} gesperrt.` : `Admin ${label} entsperrt.`,
      };
      setMessage(messages[action]);
      return true;
    } catch (adminError) {
      setError(adminError instanceof Error ? adminError.message : "Admin konnte nicht aktualisiert werden.");
      return false;
    }
  }

  async function importHvvTournament() {
    if (!isSuperadmin) {
      return;
    }
    const source = window.prompt("HVV Portal-URL", "https://www.hvv-beach.de/testportal/");
    if (!source?.trim()) {
      return;
    }
    await openHvvTournamentSelection(source.trim(), "create");
  }

  async function removeTournament() {
    if (!isSuperadmin || !tournament) {
      return;
    }
    const remaining = tournaments.filter((item) => item.id !== tournament.id);
    if (!window.confirm(`Turnier "${tournament.name}" wirklich loeschen? Alle Spiele, Ergebnislinks und Zuweisungen dieses Turniers werden entfernt.`)) {
      return;
    }
    setError("");
    setMessage("");
    try {
      await deleteTournament(tournament.id);
      setTournaments(remaining);
      setSelectedTournamentId(remaining[0]?.id ?? "");
      setTournament(remaining[0] ?? null);
      setGames([]);
      setScoreLinks([]);
      setMessage(`Turnier ${tournament.name} geloescht.`);
      if (remaining.length === 0) {
        setActiveTab("settings");
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Turnier konnte nicht geloescht werden.");
    }
  }

  async function updateAdminTournaments(admin: AdminUser, tournamentIds: string[]) {
    setError("");
    setMessage("");
    try {
      await updateAdminUser({ userId: admin.user_id, action: "updateTournaments", tournamentIds });
      setAdminUsers(await listAdminUsers());
      setMessage(`Turnierzuweisung fuer ${admin.email || admin.user_id} aktualisiert.`);
      return true;
    } catch (adminError) {
      setError(adminError instanceof Error ? adminError.message : "Turnierzuweisung konnte nicht gespeichert werden.");
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
      const { writeScoreSheetPdf } = await import("../pdfExport");
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
      <div className="admin-sticky-header">
        <div className="toolbar">
          <div className="tournament-summary">
            {tournament && <strong>{tournament.name}</strong>}
            <p className="toolbar-status">
              {tournament?.location && <span>{tournament.location}</span>}
              {tournament?.tournament_date && <span>{tournament.tournament_date}</span>}
              <span>{games.length} Spiele</span>
              {dirtyCount > 0 && <span>{dirtyCount} geaendert</span>}
              {lastSyncedAt && <span>Sync {lastSyncedAt}</span>}
            </p>
          </div>
          <div className="actions">
            {tournaments.length > 0 && (
              <select className="tournament-select" value={selectedTournamentId} onChange={(event) => setSelectedTournamentId(event.target.value)}>
                {tournaments.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            )}
            <button
              type="button"
              className="secondary"
              onClick={pushDirtyGames}
              disabled={loading || pushingHvv || dirtyCount === 0}
              title="Änderungen an HVV senden"
              aria-label="Änderungen an HVV senden"
            >
              {pushingHvv ? "Sendet..." : "HVV ↻"}
            </button>
          </div>
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
      </div>

      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}
      {linkText && <LinkOutput value={linkText} />}
      {loading ? (
        <div className="status">Dashboard wird geladen...</div>
      ) : (
        <div className="admin-tab-panel">
          {activeTab === "games" && (
            <GamesEditor games={games} tournament={tournament} onSave={saveGame} onReorder={reorderGames} onUnlockGame={unlockGame} onPrintPdf={printPdf} printing={printing} />
          )}
          {activeTab === "courts" && (
            courts.length > 0 ? (
              <CourtLinksPanel
                courts={courts}
                games={games}
                links={courtLinks}
                courtLocks={courtLocks}
                tournamentId={selectedTournamentId}
                onCreateCourtLink={createCourtLink}
                onReplaceCourtLink={replaceCourtLink}
                onUnlockCourt={unlockCourt}
                courtStreams={tournament?.court_streams ?? {}}
                onSaveCourtStream={saveCourtStream}
              />
            ) : (
              <div className="empty">Noch keine numerischen Courts konfiguriert.</div>
            )
          )}
          {activeTab === "settings" && (
            tournament ? (
              <TournamentPanel
                tournaments={tournaments}
                selectedTournament={tournament}
                selectedTournamentId={selectedTournamentId}
                onSelectTournament={setSelectedTournamentId}
                onSave={saveTournamentDraft}
                onDelete={isSuperadmin ? removeTournament : undefined}
                onImport={isSuperadmin ? importHvvTournament : undefined}
              />
            ) : (
              <div className="empty tournament-empty-state">
                <span>Keine Turniere vorhanden.</span>
                {isSuperadmin && <button type="button" onClick={importHvvTournament}>HVV Turnier importieren</button>}
              </div>
            )
          )}
          {activeTab === "admins" && isSuperadmin && (
            <AdminUsersPanel
              admins={adminUsers}
              tournaments={tournaments}
              currentUserEmail={session.user.email}
              onInvite={inviteAdmin}
              onUpdate={updateAdmin}
              onUpdateTournaments={updateAdminTournaments}
              onDelete={deleteAdmin}
            />
          )}
        </div>
      )}
      {showSyncDialog && (
        <AppDialog
          title="Spiele laden"
          message="HVV-Laden ersetzt alle vorhandenen Spiele und Ergebnislinks dieses Turniers."
          secondaryLabel="Abbrechen"
          primaryLabel="Neu laden"
          onSecondary={() => setShowSyncDialog(false)}
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
            setPendingHvvAction(null);
            setPendingHvvTournamentSource("");
            setHvvTournamentSelectionMode("update");
            setShowHvvCredentialsDialog(false);
          }}
        />
      )}
      {showHvvTournamentDialog && (
        <HvvTournamentDialog
          tournaments={hvvTournamentOptions}
          selectedTournamentId={tournament?.hvv_turnier_id ?? ""}
          mode={hvvTournamentSelectionMode}
          onSelect={selectHvvTournament}
          onClose={() => setShowHvvTournamentDialog(false)}
        />
      )}
      {hvvProgressMessage && <HvvProgressDialog message={hvvProgressMessage} />}
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
