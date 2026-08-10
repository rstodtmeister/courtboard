import { dataMode, gameSelect, getSupabase, ImportedGame, LocalGamesResponse, LocalLinksResponse, LocalSyncResponse, localJson, PushHvvResult, readStore, requireHvvCredentials, scoreDeviceId, supabaseFunctionErrorMessage, SyncGamesResult, tournamentSelect, updateStore, writeStore, createId, getHvvCredentialsStatus, LocalStore, currentAdminRole } from "./dataApiCore";
import type { AdminRole, AdminUser, Game, GameDraft, ScoreEntryData, ScoreLink, ScoreLinkResponse, Tournament } from "./types";
import type { HvvTournamentOption } from "./dataApiCore";

export async function listAdminUsers(): Promise<AdminUser[]> {
  if (dataMode === "local") {
    return readStore().admins;
  }

  const { data, error } = await getSupabase().functions.invoke<{ admins: AdminUser[] }>("manage-admins", {
    method: "GET",
  });

  if (error || !data) {
    throw new Error(await supabaseFunctionErrorMessage(error, "Admins konnten nicht geladen werden."));
  }

  return data.admins;
}

export type InviteAdminResult = {
  admin: AdminUser;
  inviteEmailSent: boolean;
  warning?: string | null;
};

export async function inviteAdminUser(params: { email: string; role: AdminRole }): Promise<InviteAdminResult> {
  if (dataMode === "local") {
    const store = readStore();
    const existing = store.admins.find((admin) => admin.email.toLowerCase() === params.email.toLowerCase());
    if (existing) {
      throw new Error("Dieser Admin existiert bereits.");
    }
    const admin: AdminUser = {
      user_id: createId("local-admin"),
      email: params.email,
      role: params.role,
      tournament_ids: store.tournaments.map((tournament) => tournament.id),
      password_setup_required: true,
      created_at: new Date().toISOString(),
      email_confirmed_at: null,
    };
    writeStore({ ...store, admins: [...store.admins, admin] });
    return { admin, inviteEmailSent: true, warning: null };
  }

  const { data, error } = await getSupabase().functions.invoke<{ admin: AdminUser; invite_email_sent?: boolean; warning?: string | null }>("manage-admins", {
    body: params,
  });

  if (error || !data) {
    throw new Error(await supabaseFunctionErrorMessage(error, "Admin konnte nicht eingeladen werden."));
  }

  return {
    admin: data.admin,
    inviteEmailSent: data.invite_email_sent ?? true,
    warning: data.warning ?? null,
  };
}

export async function updateAdminUser(params: {
  userId: string;
  action: "confirm" | "resendInvite" | "updateRole" | "setSuspended" | "updateTournaments";
  role?: AdminRole;
  suspended?: boolean;
  tournamentIds?: string[];
}): Promise<AdminUser> {
  if (dataMode === "local") {
    const store = readStore();
    const target = store.admins.find((admin) => admin.user_id === params.userId);
    if (!target) {
      throw new Error("Admin nicht gefunden.");
    }
    const nextAdmin: AdminUser = {
      ...target,
      role: params.action === "updateRole" && params.role ? params.role : target.role,
      tournament_ids: params.action === "updateTournaments" ? params.tournamentIds ?? [] : target.tournament_ids,
      email_confirmed_at: params.action === "confirm" ? new Date().toISOString() : target.email_confirmed_at,
      banned_until: params.action === "setSuspended" && params.suspended ? new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString() : null,
    };
    writeStore({
      ...store,
      admins: store.admins.map((admin) => admin.user_id === params.userId ? nextAdmin : admin),
    });
    return nextAdmin;
  }

  const { data, error } = await getSupabase().functions.invoke<{ admin: AdminUser }>("manage-admins", {
    method: "PATCH",
    body: params,
  });

  if (error || !data) {
    throw new Error(await supabaseFunctionErrorMessage(error, "Admin konnte nicht aktualisiert werden."));
  }

  return data.admin;
}

export async function deleteAdminUser(userId: string): Promise<void> {
  if (dataMode === "local") {
    const store = readStore();
    const target = store.admins.find((admin) => admin.user_id === userId);
    if (!target) {
      throw new Error("Admin nicht gefunden.");
    }
    const superadminCount = store.admins.filter((admin) => admin.role === "superadmin").length;
    if (target.role === "superadmin" && superadminCount <= 1) {
      throw new Error("Der letzte Superadmin kann nicht geloescht werden.");
    }
    writeStore({ ...store, admins: store.admins.filter((admin) => admin.user_id !== userId) });
    return;
  }

  const { error } = await getSupabase().functions.invoke("manage-admins", {
    method: "DELETE",
    body: { userId },
  });

  if (error) {
    throw new Error(await supabaseFunctionErrorMessage(error, "Admin konnte nicht geloescht werden."));
  }
}

export async function listGames(tournamentId?: string): Promise<Game[]> {
  if (dataMode === "local") {
    const data = await localJson<LocalGamesResponse>("/api/games");
    return [...data.games]
      .filter((game) => !tournamentId || game.tournament_id === tournamentId)
      .sort((left, right) => left.number.localeCompare(right.number, "de", { numeric: true }));
  }

  const tournament = tournamentId ? { id: tournamentId } : await getPrimaryTournament();
  const { data, error } = await getSupabase()
    .from("games")
    .select(gameSelect)
    .eq("tournament_id", tournament.id)
    .order("number", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function syncGamesFromHvv(options: { tournamentId: string; overwriteCourts: boolean }): Promise<SyncGamesResult> {
  const tournament = await getTournament(options.tournamentId);
  const source = tournament.hvv_edit_url || tournament.hvv_public_url || "";

  if (dataMode === "local") {
    const store = readStore();
    const credentials = requireHvvCredentials();
    try {
      const response = await fetch(`${import.meta.env.VITE_LOCAL_API_URL || "http://127.0.0.1:8787"}/api/games/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: source,
          username: credentials.username,
          password: credentials.password,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "HVV-Sync fehlgeschlagen.");
      }

      const syncResponse = body as LocalSyncResponse;
      const importedGames = syncResponse.games.map((game) => importedGame(tournament.id, game));
      writeStore({
        ...store,
        games: importedGames,
        links: [],
      });
      return {
        imported: importedGames.length,
        source: syncResponse.source,
        message: `Spiele von lokaler Java-API neu geladen: ${syncResponse.title}`,
      };
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error("Lokale Java-API ist nicht erreichbar. Starte sie mit: mvn exec:java -Dexec.args=\"--api 8787\"");
      }
      throw error;
    }
  }

  const { data, error } = await getSupabase().functions.invoke<SyncGamesResult>("sync-games", {
    body: {
      tournamentId: tournament.id,
      overwriteCourts: options.overwriteCourts,
      overwriteReferees: false,
      hvvCredentials: requireHvvCredentials(),
    },
  });

  if (error || !data) {
    throw new Error(await supabaseFunctionErrorMessage(error, "Spiele konnten nicht von HVV geladen werden."));
  }

  return data;
}

export async function listHvvTournaments(source: string): Promise<HvvTournamentOption[]> {
  if (dataMode === "local") {
    throw new Error("HVV-Turnierauswahl ist im lokalen Browsermodus nicht verfuegbar.");
  }

  const { data, error } = await getSupabase().functions.invoke<{ tournaments: HvvTournamentOption[] }>("list-hvv-tournaments", {
    body: {
      source,
      hvvCredentials: requireHvvCredentials(),
    },
  });

  if (error || !data) {
    throw new Error(await supabaseFunctionErrorMessage(error, "HVV-Turniere konnten nicht geladen werden."));
  }

  return data.tournaments;
}

export async function pushDirtyGamesToHvv(tournamentId: string): Promise<PushHvvResult> {
  if (dataMode === "local") {
    throw new Error("HVV-Uebertragung ist im lokalen Browsermodus nicht verfuegbar.");
  }

  const { data, error } = await getSupabase().functions.invoke<PushHvvResult>("save-game", {
    body: {
      mode: "dirty",
      tournamentId,
      hvvCredentials: requireHvvCredentials(),
    },
  });

  if (error || !data) {
    throw new Error(await supabaseFunctionErrorMessage(error, "Geaenderte Spiele konnten nicht an HVV uebertragen werden."));
  }

  return data;
}

export async function listTournaments(): Promise<Tournament[]> {
  if (dataMode === "local") {
    return readStore().tournaments;
  }

  const { data, error } = await getSupabase()
    .from("tournaments")
    .select(tournamentSelect)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function getTournament(tournamentId?: string): Promise<Tournament> {
  if (dataMode === "local") {
    const store = readStore();
    return store.tournaments.find((item) => item.id === tournamentId) ?? store.tournaments[0];
  }

  const data = tournamentId ? await getTournamentById(tournamentId) : await getPrimaryTournament();
  const { data: games, error: gamesError } = await getSupabase()
    .from("games")
    .select("court")
    .eq("tournament_id", data.id);

  if (gamesError) {
    throw new Error(gamesError.message);
  }

  const gameCourts = games.map((game) => game.court).filter(Boolean) as string[];
  const courts = [...new Set([...(data.courts ?? []), ...gameCourts])];
  return { ...data, courts };
}

async function getPrimaryTournament() {
  const { data, error } = await getSupabase()
    .from("tournaments")
    .select(tournamentSelect)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function getTournamentById(tournamentId: string) {
  const { data, error } = await getSupabase()
    .from("tournaments")
    .select(tournamentSelect)
    .eq("id", tournamentId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function createTournament(params: Omit<Tournament, "id">): Promise<Tournament> {
  if (dataMode === "local") {
    const store = readStore();
    const tournament: Tournament = { id: createId("local-tournament"), ...params };
    writeStore({ ...store, tournaments: [...store.tournaments, tournament] });
    return tournament;
  }

  const { data, error } = await getSupabase()
    .from("tournaments")
    .insert({
      name: params.name,
      hvv_edit_url: params.hvv_edit_url,
      hvv_public_url: params.hvv_public_url,
      hvv_turnier_id: params.hvv_turnier_id ?? null,
      hvv_veranstaltung_id: params.hvv_veranstaltung_id ?? null,
      hvv_type: params.hvv_type ?? null,
      hvv_gender: params.hvv_gender ?? null,
      tournament_date: params.tournament_date ?? null,
      location: params.location ?? null,
      token_base_url: params.token_base_url,
      courts: params.courts,
    })
    .select(tournamentSelect)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function saveTournament(tournament: Tournament): Promise<Tournament> {
  if (dataMode === "local") {
    const store = readStore();
    writeStore({
      ...store,
      tournaments: store.tournaments.map((item) => item.id === tournament.id ? tournament : item),
    });
    return tournament;
  }

  const { data, error } = await getSupabase()
    .from("tournaments")
    .update({
      name: tournament.name,
      hvv_edit_url: tournament.hvv_edit_url,
      hvv_public_url: tournament.hvv_public_url,
      hvv_turnier_id: tournament.hvv_turnier_id ?? null,
      hvv_veranstaltung_id: tournament.hvv_veranstaltung_id ?? null,
      hvv_type: tournament.hvv_type ?? null,
      hvv_gender: tournament.hvv_gender ?? null,
      tournament_date: tournament.tournament_date ?? null,
      location: tournament.location ?? null,
      token_base_url: tournament.token_base_url,
      courts: tournament.courts,
    })
    .eq("id", tournament.id)
    .select(tournamentSelect)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function deleteTournament(tournamentId: string): Promise<void> {
  if (dataMode === "local") {
    const store = readStore();
    writeStore({
      ...store,
      tournaments: store.tournaments.filter((tournament) => tournament.id !== tournamentId),
      games: store.games.filter((game) => game.tournament_id !== tournamentId),
      links: store.links.filter((link) => link.tournament_id !== tournamentId),
      admins: store.admins.map((admin) => ({
        ...admin,
        tournament_ids: admin.tournament_ids.filter((id) => id !== tournamentId),
      })),
    });
    return;
  }

  const { error } = await getSupabase()
    .from("tournaments")
    .delete()
    .eq("id", tournamentId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function saveGame(game: Game, draft: GameDraft): Promise<Game> {
  if (dataMode === "local") {
    const store = readStore();
    const data = await localJson<{ game: Game }>("/api/games/update", {
      method: "POST",
      body: JSON.stringify({
        gameId: game.id,
        court: draft.court,
        referee: draft.referee,
        result: draft.result,
        winnerTeam: draft.winner_team,
        gameRating: draft.game_rating,
        set1TeamA: draft.set1_team_a,
        set1TeamB: draft.set1_team_b,
        set2TeamA: draft.set2_team_a,
        set2TeamB: draft.set2_team_b,
        set3TeamA: draft.set3_team_a,
        set3TeamB: draft.set3_team_b,
        printed: draft.printed,
        completed: draft.completed,
        pointHistory: draft.point_history,
      }),
    });
    const updated = data.game;
    writeStore({
      ...store,
      games: store.games.map((item) => item.id === game.id ? updated : item),
    });
    return updated;
  }

  const { data, error } = await getSupabase()
    .from("games")
    .update({ ...draft, dirty: true })
    .eq("id", game.id)
    .select(gameSelect)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateGameDisplayOrders(updates: Array<{ gameId: string; displayOrder: number }>): Promise<Game[]> {
  if (updates.length === 0) {
    return [];
  }

  if (dataMode === "local") {
    const store = readStore();
    const data = await localJson<{ games: Game[] }>("/api/games/reorder", {
      method: "POST",
      body: JSON.stringify({ orders: updates }),
    });
    const updatedById = new Map(data.games.map((game) => [game.id, game]));
    writeStore({
      ...store,
      games: store.games.map((game) => updatedById.get(game.id) ?? game),
    });
    return data.games;
  }

  const updatedGames = await Promise.all(updates.map(async (update) => {
    const { data, error } = await getSupabase()
      .from("games")
      .update({ display_order: update.displayOrder })
      .eq("id", update.gameId)
      .select(gameSelect)
      .single();

    if (error) {
      throw new Error(error.message);
    }
    return data;
  }));

  return updatedGames;
}

export async function createScoreLink(params: { tournamentId: string; gameId?: string; court?: string }): Promise<ScoreLinkResponse> {
  if (dataMode === "local") {
    return localJson<ScoreLinkResponse>("/api/score-links", {
      method: "POST",
      body: JSON.stringify({
        tournamentId: params.tournamentId,
        gameId: params.gameId ?? "",
        court: params.court ?? "",
      }),
    });
  }

  const { data, error } = await getSupabase().functions.invoke<ScoreLinkResponse>("create-score-link", {
    body: {
      tournamentId: params.tournamentId,
      gameId: params.gameId,
      court: params.court,
    },
  });

  if (error || !data) {
    throw new Error(await supabaseFunctionErrorMessage(error, "Link konnte nicht erzeugt werden."));
  }

  return data;
}

export async function loadScoreEntry(token: string): Promise<ScoreEntryData> {
  if (dataMode === "local") {
    return localJson<ScoreEntryData>(
      `/api/score-entry?token=${encodeURIComponent(token)}&deviceId=${encodeURIComponent(scoreDeviceId())}`,
    );
  }

  const { data, error } = await getSupabase().functions.invoke<ScoreEntryData>(
    `submit-score?token=${encodeURIComponent(token)}&deviceId=${encodeURIComponent(scoreDeviceId())}`,
    { method: "GET" },
  );

  if (error || !data) {
    throw new Error(await supabaseFunctionErrorMessage(error, "Der Ergebnislink konnte nicht geladen werden."));
  }

  return data;
}

export async function listScoreLinks(tournamentId?: string): Promise<ScoreLink[]> {
  if (dataMode === "local") {
    const data = await localJson<LocalLinksResponse>("/api/score-links");
    return data.links
      .filter((link) => !tournamentId || link.tournament_id === tournamentId)
      .sort((left, right) => right.created_at.localeCompare(left.created_at));
  }

  const tournament = tournamentId ? { id: tournamentId } : await getPrimaryTournament();
  const { data, error } = await getSupabase()
    .from("score_entry_links")
    .select("id,tournament_id,game_id,court,token,expires_at,used_at,created_at")
    .eq("tournament_id", tournament.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((link) => ({ ...link, token: link.token ?? null, disabled_at: null }));
}

export async function disableScoreLink(linkId: string): Promise<void> {
  if (dataMode === "local") {
    await localJson<{ ok: boolean }>("/api/score-links/disable", {
      method: "POST",
      body: JSON.stringify({ linkId }),
    });
    return;
  }

  const { error } = await getSupabase()
    .from("score_entry_links")
    .update({ expires_at: new Date().toISOString() })
    .eq("id", linkId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function unlockScoreGame(gameId: string): Promise<void> {
  if (dataMode === "local") {
    await localJson<{ ok: boolean }>("/api/score-entry/unlock", {
      method: "POST",
      body: JSON.stringify({ gameId }),
    });
    return;
  }

  const { error } = await getSupabase()
    .from("games")
    .update({
      score_locked_by_device: null,
      score_locked_at: null,
    })
    .eq("id", gameId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function submitScore(token: string, game: Game, draft: GameDraft): Promise<void> {
  if (dataMode === "local") {
    await localJson<{ ok: boolean }>("/api/submit-score", {
      method: "POST",
      body: JSON.stringify({
        token,
        deviceId: scoreDeviceId(),
        gameId: game.id,
        referee: draft.referee,
        result: draft.result,
        winnerTeam: draft.winner_team,
        gameRating: draft.game_rating,
        set1TeamA: draft.set1_team_a,
        set1TeamB: draft.set1_team_b,
        set2TeamA: draft.set2_team_a,
        set2TeamB: draft.set2_team_b,
        set3TeamA: draft.set3_team_a,
        set3TeamB: draft.set3_team_b,
        printed: draft.printed,
        completed: draft.completed,
        pointHistory: draft.point_history,
      }),
    });
    return;
  }

  const { error } = await getSupabase().functions.invoke("submit-score", {
    body: {
      token,
      deviceId: scoreDeviceId(),
      gameId: game.id,
      referee: draft.referee,
      result: draft.result,
      winnerTeam: draft.winner_team,
      gameRating: draft.game_rating,
      set1TeamA: draft.set1_team_a,
      set1TeamB: draft.set1_team_b,
      set2TeamA: draft.set2_team_a,
      set2TeamB: draft.set2_team_b,
      set3TeamA: draft.set3_team_a,
      set3TeamB: draft.set3_team_b,
      completed: draft.completed,
      pointHistory: draft.point_history,
    },
  });

  if (error) {
    throw new Error(await supabaseFunctionErrorMessage(error, "Ergebnis konnte nicht gespeichert werden."));
  }
}

function importedGame(tournamentId: string, game: ImportedGame): Game {
  return {
    id: createId("game"),
    tournament_id: tournamentId,
    number: game.number,
    round: game.round ?? "",
    game_date: game.game_date ?? "",
    court: game.court ?? "",
    team_a: game.team_a ?? "",
    team_b: game.team_b ?? "",
    referee: game.referee ?? "",
    result: game.result ?? "",
    winner_team: game.winner_team ?? "",
    edit_url: game.edit_url ?? "",
    edit_method: game.edit_method ?? "GET",
    edit_data: game.edit_data ?? "",
    game_rating: game.game_rating ?? "",
    set1_team_a: game.set1_team_a ?? "",
    set1_team_b: game.set1_team_b ?? "",
    set2_team_a: game.set2_team_a ?? "",
    set2_team_b: game.set2_team_b ?? "",
    set3_team_a: game.set3_team_a ?? "",
    set3_team_b: game.set3_team_b ?? "",
    printed: false,
    dirty: false,
    completed: false,
  };
}
