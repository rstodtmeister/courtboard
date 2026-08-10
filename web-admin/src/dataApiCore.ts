import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AdminRole, AdminUser, AppSession, Game, ScoreLink, Tournament } from "./types";

export const gameSelect =
  "id,tournament_id,number,round,game_date,court,display_order,team_a,team_b,referee,result,winner_team,game_rating,set1_team_a,set1_team_b,set2_team_a,set2_team_b,set3_team_a,set3_team_b,printed,dirty,completed,point_history,score_locked_by_device,score_locked_at";
export const tournamentSelect =
  "id,name,hvv_edit_url,hvv_public_url,hvv_turnier_id,hvv_veranstaltung_id,hvv_type,hvv_gender,tournament_date,location,token_base_url,courts";

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

export type PushHvvResult = {
  sent: number;
  failed: number;
  results: Array<{ gameId: string; number: string; ok: boolean; error?: string }>;
};

export type HvvTournamentOption = {
  name: string;
  hvv_turnier_id: string;
  hvv_veranstaltung_id: string;
  hvv_type: string;
  hvv_gender: string;
  tournament_date: string;
  location: string;
  detail_url: string;
  schedule_url: string;
};

export type ImportedGame = Omit<Game, "id" | "tournament_id" | "printed" | "dirty" | "completed"> & {
  edit_url?: string | null;
  edit_method?: string | null;
  edit_data?: string | null;
};

export type LocalSyncResponse = {
  source: string;
  title: string;
  scrapedAt: string;
  imported: number;
  games: ImportedGame[];
};

export type LocalGamesResponse = {
  games: Game[];
};

export type LocalLinksResponse = {
  links: ScoreLink[];
};

export type StoredScoreLink = {
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

export type LocalStore = {
  session: AppSession | null;
  admins: AdminUser[];
  tournaments: Tournament[];
  games: Game[];
  links: StoredScoreLink[];
};

type HvvCredentials = {
  username: string;
  password: string;
  expiresAt: number;
};

const storeKey = "courtboard.localData.v1";
const deviceIdKey = "courtboard.deviceId.v1";
let supabaseClient: SupabaseClient | null = null;
let hvvCredentials: HvvCredentials | null = null;
const hvvCredentialsTtlMs = 60 * 60 * 1000;

export function getSupabase() {
  if (!supabaseClient) {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
    }
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  }
  return supabaseClient;
}

export function getHvvCredentialsStatus() {
  const credentials = activeHvvCredentials();
  return credentials ? { active: true, username: credentials.username, expiresAt: credentials.expiresAt } : { active: false };
}

export function setHvvCredentials(username: string, password: string) {
  hvvCredentials = {
    username,
    password,
    expiresAt: Date.now() + hvvCredentialsTtlMs,
  };
}

export function clearHvvCredentials() {
  hvvCredentials = null;
}

function activeHvvCredentials() {
  if (!hvvCredentials || hvvCredentials.expiresAt <= Date.now()) {
    hvvCredentials = null;
    return null;
  }
  return hvvCredentials;
}

export function requireHvvCredentials() {
  const credentials = activeHvvCredentials();
  if (!credentials) {
    throw new Error("HVV-Zugangsdaten fehlen. Bitte HVV-Zugang fuer diese Sitzung eingeben.");
  }
  return credentials;
}

export async function currentAdminRole(userId: string): Promise<AdminRole | null> {
  const { data, error } = await getSupabase()
    .from("admin_users")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data?.role) {
    return null;
  }

  return data.role === "superadmin" ? "superadmin" : "admin";
}

export async function supabaseFunctionErrorMessage(error: unknown, fallback: string) {
  if (!error) {
    return fallback;
  }

  const context = typeof error === "object" && "context" in error
    ? (error as { context?: unknown }).context
    : null;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json() as { error?: unknown; message?: unknown };
      const message = typeof body.error === "string" ? body.error : typeof body.message === "string" ? body.message : "";
      if (message) {
        return message;
      }
    } catch {
      try {
        const text = await context.clone().text();
        if (text.trim()) {
          return text.trim();
        }
      } catch {
        // Fall back to the Supabase error message below.
      }
    }
  }

  return error instanceof Error && error.message ? error.message : fallback;
}

export function readStore(): LocalStore {
  const raw = window.localStorage.getItem(storeKey);
  if (!raw) {
    const seeded = seedStore();
    writeStore(seeded);
    return seeded;
  }

  return normalizeStore(JSON.parse(raw) as Partial<LocalStore>);
}

export async function localJson<T>(path: string, options: RequestInit = {}): Promise<T> {
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

export function updateStore(patch: Partial<LocalStore>) {
  writeStore({ ...readStore(), ...patch });
}

export function writeStore(store: LocalStore) {
  window.localStorage.setItem(storeKey, JSON.stringify(store));
}

export function scoreDeviceId() {
  let deviceId = window.localStorage.getItem(deviceIdKey);
  if (!deviceId) {
    deviceId = window.crypto?.randomUUID?.() ?? `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(deviceIdKey, deviceId);
  }
  return deviceId;
}

export function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function seedStore(): LocalStore {
  const tournamentId = "local-tournament-1";
  const tournament: Tournament = {
    id: tournamentId,
    name: "Lokales Beispielturnier",
    hvv_edit_url: "",
    hvv_public_url: "",
    hvv_turnier_id: null,
    hvv_veranstaltung_id: null,
    hvv_type: null,
    hvv_gender: null,
    tournament_date: null,
    location: null,
    token_base_url: "",
    courts: ["1", "2", "3", "4"],
  };
  return {
    session: { user: { email: "admin@local.test", role: "superadmin" } },
    admins: [
      {
        user_id: "local-superadmin-1",
        email: "admin@local.test",
        role: "superadmin",
        tournament_ids: [tournamentId],
        password_setup_required: false,
        created_at: new Date().toISOString(),
        email_confirmed_at: new Date().toISOString(),
      },
    ],
    tournaments: [tournament],
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
  const legacyStore = store as Partial<LocalStore> & { tournament?: Tournament };
  const tournaments = store.tournaments ?? (legacyStore.tournament ? [legacyStore.tournament] : [{
    ...seeded.tournaments[0],
    id: store.games?.[0]?.tournament_id ?? seeded.tournaments[0].id,
  }]);

  return {
    session: store.session
      ? { user: { ...store.session.user, role: store.session.user.role ?? seeded.admins[0].role } }
      : seeded.session,
    admins: (store.admins ?? seeded.admins).map((admin) => ({
      ...admin,
      tournament_ids: admin.tournament_ids ?? tournaments.map((tournament) => tournament.id),
      password_setup_required: admin.password_setup_required ?? false,
    })),
    tournaments: tournaments.map((tournament) => ({
      ...tournament,
      hvv_turnier_id: tournament.hvv_turnier_id ?? null,
      hvv_veranstaltung_id: tournament.hvv_veranstaltung_id ?? null,
      hvv_type: tournament.hvv_type ?? null,
      hvv_gender: tournament.hvv_gender ?? null,
      tournament_date: tournament.tournament_date ?? null,
      location: tournament.location ?? null,
      token_base_url: tournament.token_base_url ?? "",
    })),
    games: (store.games ?? seeded.games).map((game) => ({ ...game, display_order: game.display_order ?? null, completed: game.completed ?? false })),
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
    display_order: null,
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
