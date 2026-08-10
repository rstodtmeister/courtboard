import { createId, dataMode, gameSelect, getHvvCredentialsStatus, getSupabase, ImportedGame, LocalGamesResponse, LocalSyncResponse, localAdminJson, localJson, PushHvvResult, readStore, requireHvvCredentials, supabaseFunctionErrorMessage, SyncGamesResult, writeStore } from "./dataApiCore";
import type { Game, GameDraft, Tournament } from "./types";
import type { HvvTournamentOption } from "./dataApiCore";
import { getPrimaryTournament, getPublicTournament, getTournament } from "./dataApiTournaments";

export async function listGames(tournamentId?: string): Promise<Game[]> {
  if (dataMode === "local") {
    const data = await localAdminJson<LocalGamesResponse>("/api/admin/games");
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

export async function listPublicGames(tournamentId?: string): Promise<Game[]> {
  if (dataMode === "local") {
    const data = await localJson<LocalGamesResponse>("/api/games");
    return [...data.games]
      .filter((game) => !tournamentId || game.tournament_id === tournamentId)
      .sort((left, right) => left.number.localeCompare(right.number, "de", { numeric: true }));
  }

  const tournament = tournamentId ? { id: tournamentId } : await getPublicTournament();
  const { data, error } = await getSupabase()
    .from("public_games")
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
      const syncResponse = await localAdminJson<LocalSyncResponse>("/api/games/sync", {
        method: "POST",
        body: JSON.stringify({
          url: source,
          username: credentials.username,
          password: credentials.password,
        }),
      });
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

export async function saveGame(game: Game, draft: GameDraft): Promise<Game> {
  if (dataMode === "local") {
    const store = readStore();
    const data = await localAdminJson<{ game: Game }>("/api/games/update", {
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
    const data = await localAdminJson<{ games: Game[] }>("/api/games/reorder", {
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
