import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppSession, Game, GameDraft, ScoreEntryData, ScoreLink, ScoreLinkResponse, Tournament } from "./types";

const gameSelect =
  "id,tournament_id,number,game_date,court,team_a,team_b,referee,result,winner_team,game_rating,set1_team_a,set1_team_b,set2_team_a,set2_team_b,set3_team_a,set3_team_b,printed,dirty,completed,point_history,score_locked_by_device,score_locked_at";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const requestedMode = import.meta.env.VITE_DATA_MODE;
export const localApiUrl = import.meta.env.VITE_LOCAL_API_URL || "http://127.0.0.1:8787";

export const dataMode: "local" | "supabase" =
  requestedMode === "supabase" && supabaseUrl && supabaseAnonKey && !supabaseAnonKey.startsWith("<")
    ? "supabase"
    : "local";

export type SyncGamesResult = {
  imported: number;
  source: string;
  message: string;
};

type ImportedGame = Omit<Game, "id" | "tournament_id" | "printed" | "dirty" | "completed"> & {
  edit_url?: string | null;
  edit_method?: string | null;
  edit_data?: string | null;
};

type LocalSyncResponse = {
  source: string;
  title: string;
  scrapedAt: string;
  imported: number;
  games: ImportedGame[];
};

type LocalGamesResponse = {
  games: Game[];
};

type LocalLinksResponse = {
  links: ScoreLink[];
};

type StoredScoreLink = {
  id: string;
  tournament_id: string;
  game_id: string | null;
  court: string | null;
  token: string;
  expires_at: string | null;
  used_at: string | null;
  disabled_at: string | null;
  created_at: string;
};

type LocalStore = {
  session: AppSession | null;
  tournament: Tournament;
  games: Game[];
  links: StoredScoreLink[];
};

const storeKey = "courtboard.localData.v1";
const deviceIdKey = "courtboard.deviceId.v1";
let supabaseClient: SupabaseClient | null = null;

function getSupabase() {
  if (!supabaseClient) {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
    }
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  }
  return supabaseClient;
}

export async function getSession(): Promise<AppSession | null> {
  if (dataMode === "local") {
    return readStore().session;
  }

  const { data } = await getSupabase().auth.getSession();
  const email = data.session?.user.email;
  return email ? { user: { email } } : null;
}

export function onSessionChange(callback: (session: AppSession | null) => void) {
  if (dataMode === "local") {
    const listener = (event: StorageEvent) => {
      if (event.key === storeKey) {
        callback(readStore().session);
      }
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }

  const { data } = getSupabase().auth.onAuthStateChange((_event, session) => {
    const email = session?.user.email;
    callback(email ? { user: { email } } : null);
  });

  return () => data.subscription.unsubscribe();
}

export async function signIn(email: string, password: string): Promise<{ error?: string }> {
  if (dataMode === "local") {
    if (!email || !password) {
      return { error: "E-Mail und Passwort sind erforderlich." };
    }

    updateStore({ session: { user: { email } } });
    return {};
  }

  const { error } = await getSupabase().auth.signInWithPassword({ email, password });
  return error ? { error: error.message } : {};
}

export async function signOut() {
  if (dataMode === "local") {
    updateStore({ session: null });
    return;
  }

  await getSupabase().auth.signOut();
}

export async function listGames(): Promise<Game[]> {
  if (dataMode === "local") {
    const data = await localJson<LocalGamesResponse>("/api/games");
    return [...data.games].sort((left, right) => left.number.localeCompare(right.number, "de", { numeric: true }));
  }

  const { data, error } = await getSupabase()
    .from("games")
    .select(gameSelect)
    .order("number", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function syncGamesFromHvv(options: { overwriteCourts: boolean }): Promise<SyncGamesResult> {
  const tournament = await getTournament();
  const source = tournament.hvv_edit_url || tournament.hvv_public_url || "";

  if (dataMode === "local") {
    const store = readStore();
    try {
      const existingGames = (await localJson<LocalGamesResponse>("/api/games")).games;
      const response = await fetch(`${localApiUrl}/api/games/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: source,
          username: "",
          password: "",
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "HVV-Sync fehlgeschlagen.");
      }

      const syncResponse = body as LocalSyncResponse;
      const importedGames = syncResponse.games.map((game) => importedGame(tournament.id, game));
      const mergedGames = mergeImportedGames(importedGames, existingGames, options.overwriteCourts);
      await Promise.all(mergedGames.map((game) => updateLocalGame(game)));
      writeStore({
        ...store,
        games: mergedGames,
      });
      return {
        imported: importedGames.length,
        source: syncResponse.source,
        message: `Spiele von lokaler Java-API geladen: ${syncResponse.title}`,
      };
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error("Lokale Java-API ist nicht erreichbar. Starte sie mit: mvn exec:java -Dexec.args=\"--api 8787\"");
      }
      throw error;
    }
  }

  const { data, error } = await getSupabase().functions.invoke<SyncGamesResult>("sync-games", {
    body: { tournamentId: tournament.id, overwriteCourts: options.overwriteCourts, overwriteReferees: false },
  });

  if (error || !data) {
    throw new Error(error?.message ?? "Spiele konnten nicht von HVV geladen werden.");
  }

  return data;
}

function importedGame(tournamentId: string, game: ImportedGame): Game {
  return {
    id: createId("game"),
    tournament_id: tournamentId,
    number: game.number,
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

async function updateLocalGame(game: Game) {
  await localJson<{ game: Game }>("/api/games/update", {
    method: "POST",
    body: JSON.stringify({
      gameId: game.id,
      court: game.court,
      referee: game.referee,
      result: game.result,
      winnerTeam: game.winner_team,
      gameRating: game.game_rating,
      set1TeamA: game.set1_team_a,
      set1TeamB: game.set1_team_b,
      set2TeamA: game.set2_team_a,
      set2TeamB: game.set2_team_b,
      set3TeamA: game.set3_team_a,
      set3TeamB: game.set3_team_b,
      printed: game.printed,
      completed: game.completed,
      pointHistory: game.point_history,
      dirty: game.dirty,
    }),
  });
}

export async function getTournament(): Promise<Tournament> {
  if (dataMode === "local") {
    return readStore().tournament;
  }

  const { data, error } = await getSupabase()
    .from("tournaments")
    .select("id,name,hvv_edit_url,hvv_public_url,token_base_url")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const games = await listGames();
  const courts = [...new Set(games.map((game) => game.court).filter(Boolean) as string[])];
  return { ...data, courts };
}

export async function saveTournament(tournament: Tournament): Promise<Tournament> {
  if (dataMode === "local") {
    const store = readStore();
    writeStore({ ...store, tournament });
    return tournament;
  }

  const { data, error } = await getSupabase()
    .from("tournaments")
    .update({
      name: tournament.name,
      hvv_edit_url: tournament.hvv_edit_url,
      hvv_public_url: tournament.hvv_public_url,
      token_base_url: tournament.token_base_url,
    })
    .eq("id", tournament.id)
    .select("id,name,hvv_edit_url,hvv_public_url,token_base_url")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return { ...data, courts: tournament.courts };
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
    throw new Error(error?.message ?? "Link konnte nicht erzeugt werden.");
  }

  return data;
}

function scoreDeviceId() {
  let deviceId = window.localStorage.getItem(deviceIdKey);
  if (!deviceId) {
    deviceId = window.crypto?.randomUUID?.() ?? `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(deviceIdKey, deviceId);
  }
  return deviceId;
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
    throw new Error(error?.message ?? "Der Ergebnislink konnte nicht geladen werden.");
  }

  return data;
}

export async function listScoreLinks(): Promise<ScoreLink[]> {
  if (dataMode === "local") {
    const data = await localJson<LocalLinksResponse>("/api/score-links");
    return data.links.sort((left, right) => right.created_at.localeCompare(left.created_at));
  }

  const { data, error } = await getSupabase()
    .from("score_entry_links")
    .select("id,tournament_id,game_id,court,expires_at,used_at,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((link) => ({ ...link, token: null, disabled_at: null }));
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
    throw new Error(error.message);
  }
}

function readStore(): LocalStore {
  const raw = window.localStorage.getItem(storeKey);
  if (!raw) {
    const seeded = seedStore();
    writeStore(seeded);
    return seeded;
  }

  return normalizeStore(JSON.parse(raw) as Partial<LocalStore>);
}

async function localJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${localApiUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Lokale API-Anfrage fehlgeschlagen.");
  }
  return data as T;
}

function updateStore(patch: Partial<LocalStore>) {
  writeStore({ ...readStore(), ...patch });
}

function writeStore(store: LocalStore) {
  window.localStorage.setItem(storeKey, JSON.stringify(store));
}

function seedStore(): LocalStore {
  const tournamentId = "local-tournament-1";
  return {
    session: { user: { email: "admin@local.test" } },
    tournament: {
      id: tournamentId,
      name: "Lokales Beispielturnier",
      hvv_edit_url: "",
      hvv_public_url: "",
      token_base_url: "",
      courts: ["1", "2", "3", "4"],
    },
    links: [],
    games: [
      createGame(tournamentId, "1", "09:00", "1", "Team A", "Team B", "Team C"),
      createGame(tournamentId, "2", "09:00", "2", "Team D", "Team E", "Team F"),
      createGame(tournamentId, "3", "09:35", "1", "Team C", "Team D", "Team A"),
      createGame(tournamentId, "4", "09:35", "2", "Team F", "Team A", "Team E"),
      createGame(tournamentId, "5", "10:10", "1", "Team B", "Team E", "Team D"),
      createGame(tournamentId, "6", "10:10", "2", "Team C", "Team F", "Team B"),
    ],
  };
}

function normalizeStore(store: Partial<LocalStore>): LocalStore {
  const seeded = seedStore();
  const tournament = store.tournament ?? {
    ...seeded.tournament,
    id: store.games?.[0]?.tournament_id ?? seeded.tournament.id,
  };

  return {
    session: store.session ?? seeded.session,
    tournament: {
      ...tournament,
      token_base_url: tournament.token_base_url ?? "",
    },
    games: (store.games ?? seeded.games).map((game) => ({ ...game, completed: game.completed ?? false })),
    links: (store.links ?? []).map((link) => ({
      ...link,
      disabled_at: link.disabled_at ?? null,
      created_at: link.created_at ?? new Date().toISOString(),
    })),
  };
}

function createGame(tournamentId: string, number: string, gameDate: string, court: string, teamA: string, teamB: string, referee: string): Game {
  return {
    id: `local-game-${number}`,
    tournament_id: tournamentId,
    number,
    game_date: gameDate,
    court,
    team_a: teamA,
    team_b: teamB,
    referee,
    result: "",
    winner_team: "",
    game_rating: "Normal",
    set1_team_a: "",
    set1_team_b: "",
    set2_team_a: "",
    set2_team_b: "",
    set3_team_a: "",
    set3_team_b: "",
    printed: false,
    dirty: false,
    completed: false,
  };
}

function mergeImportedGames(importedGames: Game[], existingGames: Game[], overwriteCourts: boolean) {
  return importedGames.map((importedGame) => {
    const existing = existingGames.find((game) => game.number === importedGame.number);
    if (!existing) {
      return importedGame;
    }

    return {
      ...importedGame,
      id: existing.id,
      court: overwriteCourts ? importedGame.court : existing.court,
      referee: existing.referee,
      result: existing.result,
      winner_team: existing.winner_team,
      game_rating: existing.game_rating,
      set1_team_a: existing.set1_team_a,
      set1_team_b: existing.set1_team_b,
      set2_team_a: existing.set2_team_a,
      set2_team_b: existing.set2_team_b,
      set3_team_a: existing.set3_team_a,
      set3_team_b: existing.set3_team_b,
      printed: existing.printed,
      dirty: existing.dirty,
      completed: existing.completed,
    };
  });
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
