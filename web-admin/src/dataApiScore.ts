import { dataMode, getSupabase, LocalLinksResponse, localAdminJson, localJson, scoreDeviceId, supabaseFunctionErrorMessage } from "./dataApiCore";
import type { CourtLock, Game, GameDraft, ScoreEntryData, ScoreLink, ScoreLinkResponse } from "./types";
import { getPrimaryTournament } from "./dataApiTournaments";
import { createScoreSaveQueue } from "./scoreSaveQueue";

import { createScoreOutbox, ScoreTransportError, type ScoreAck } from "./scoreOutbox";
import { draftFromGame } from "./scoreLogic";

export const scoreOutbox = createScoreOutbox({
  storage: { getItem: (key) => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value),
    key: (index) => window.localStorage.key(index), get length() { return window.localStorage.length; } },
  uuid: () => crypto.randomUUID(), online: () => navigator.onLine,
  send: async (record, command) => {
    const { data, error } = await getSupabase().functions.invoke<ScoreAck>("submit-score", {
      body: { ...command, token: record.token, deviceId: record.deviceId, gameId: record.game.id },
      signal: AbortSignal.timeout(12_000),
    });
    if (error || !data) {
      const status = error?.context instanceof Response ? error.context.status : 0;
      throw new ScoreTransportError(await supabaseFunctionErrorMessage(error, "Verbindung unterbrochen. Eingaben bleiben lokal gesichert."),
        [400,401,403,404,409,410,413,422,423].includes(status));
    }
    return data;
  },
});

const enqueueScoreSave = createScoreSaveQueue();
function cachedScoreEntry(record: NonNullable<ReturnType<typeof scoreOutbox.cached>>): ScoreEntryData {
  const draft = record.pending.at(-1)?.draft ?? record.acknowledged;
  return { ...record.context, games: [{ ...record.game, ...draft, completed: record.acknowledged.completed, score_revision: record.revision }] };
}

export async function createScoreLink(params: { tournamentId: string; gameId?: string; court?: string }): Promise<ScoreLinkResponse> {
  if (dataMode === "local") {
    return localAdminJson<ScoreLinkResponse>("/api/score-links", {
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

  const cached = scoreOutbox.cached(token);
  if (cached && (cached.pending.length || cached.blocked)) {
    scoreOutbox.retry();
    return cachedScoreEntry(cached);
  }
  const { data, error } = await getSupabase().functions.invoke<ScoreEntryData>(
    `submit-score?token=${encodeURIComponent(token)}&deviceId=${encodeURIComponent(scoreDeviceId())}`,
    { method: "GET" },
  );

  if (error || !data) {
    const status = error?.context instanceof Response ? error.context.status : 0;
    if (cached && (status === 0 || status >= 500 || status === 408 || status === 429)) return cachedScoreEntry(cached);
    throw new Error(await supabaseFunctionErrorMessage(error, "Der Ergebnislink konnte nicht geladen werden."));
  }
  for (const game of data.games) scoreOutbox.initialize(token, game, data, scoreDeviceId(), draftFromGame(game));
  return data;
}

export async function listScoreLinks(tournamentId?: string): Promise<ScoreLink[]> {
  if (dataMode === "local") {
    const data = await localAdminJson<LocalLinksResponse>("/api/score-links");
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

export async function listCourtLocks(tournamentId: string): Promise<CourtLock[]> {
  if (dataMode === "local") {
    const games = (await localAdminJson<{ games: Game[] }>("/api/admin/games")).games;
    return games.filter((game) => game.tournament_id === tournamentId && game.court && (game.score_locked_by_device || game.score_blocked_device)).map((game) => ({
      tournament_id: tournamentId,
      court: game.court!,
      active_game_id: game.score_locked_by_device ? game.id : null,
      active_device_id: game.score_locked_by_device ?? null,
      locked_at: game.score_locked_at ?? null,
      blocked_device_id: game.score_blocked_device ?? null,
      blocked_until: game.score_blocked_until ?? null,
    }));
  }
  const { data, error } = await getSupabase().from("score_court_locks")
    .select("tournament_id,court,active_game_id,active_device_id,locked_at,blocked_device_id,blocked_until")
    .eq("tournament_id", tournamentId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function disableScoreLink(linkId: string): Promise<void> {
  if (dataMode === "local") {
    await localAdminJson<{ ok: boolean }>("/api/score-links/disable", {
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
    await localAdminJson<{ ok: boolean }>("/api/score-entry/unlock", {
      method: "POST",
      body: JSON.stringify({ gameId }),
    });
    return;
  }

  const { error } = await getSupabase().rpc("unlock_score_game_lock", {
    p_game_id: gameId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function unlockScoreCourt(tournamentId: string, court: string): Promise<void> {
  if (dataMode === "local") {
    await localAdminJson<{ ok: boolean }>("/api/score-entry/unlock", {
      method: "POST",
      body: JSON.stringify({ tournamentId, court }),
    });
    return;
  }

  const { error } = await getSupabase().rpc("unlock_score_court", {
    p_tournament_id: tournamentId,
    p_court: court,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export function submitScore(token: string, game: Game, draft: GameDraft): Promise<void> {
  // Capture the score and identity now, not when the queued request starts.
  const snapshot = { ...draft };
  if (dataMode === "supabase") return scoreOutbox.enqueue(game.id, snapshot);
  const gameId = game.id;
  const deviceId = scoreDeviceId();
  return enqueueScoreSave(gameId, () => sendScore(token, gameId, deviceId, snapshot));
}

async function sendScore(token: string, gameId: string, deviceId: string, draft: GameDraft): Promise<void> {
  if (dataMode === "local") {
    await localJson<{ ok: boolean }>("/api/submit-score", {
      method: "POST",
      body: JSON.stringify({
        token,
        deviceId,
        gameId,
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

  throw new Error("Unbekannter Speichermodus.");
}

export async function heartbeatScoreEntry(token: string, gameId: string): Promise<void> {
  if (dataMode === "local") {
    await localJson<{ ok: boolean }>("/api/submit-score", {
      method: "POST",
      body: JSON.stringify({ token, deviceId: scoreDeviceId(), gameId, action: "heartbeat" }),
    });
    return;
  }

  const { error } = await getSupabase().functions.invoke("submit-score", {
    body: { token, deviceId: scoreDeviceId(), gameId, action: "heartbeat" },
  });
  if (error) {
    throw new Error(await supabaseFunctionErrorMessage(error, "Court-Sperre konnte nicht verlaengert werden."));
  }
}

export async function getScoreDeliveryStatus(token: string, gameId: string): Promise<string | null> {
  if (dataMode === "local") return null;
  const { data, error } = await getSupabase().functions.invoke("submit-score", {
    body: { token, gameId, action: "sync-status" },
  });
  if (error) throw new Error("HVV-Status ist momentan nicht verfügbar.");
  return data.status;
}
