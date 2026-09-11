import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { sha256Hex } from "../_shared/token.ts";
import { processHvvDelivery } from "../_shared/hvv-delivery.ts";
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };
import { ScoreValidationError, validateScoreSubmission } from "../_shared/score-validation.ts";

type SubmitScoreRequest = {
  token: string;
  protocol?: number;
  operationId?: string;
  baseRevision?: number;
  historyDelta?: { drop: number; keep: number; append: unknown[] };
  action?: "heartbeat" | "sync-status";
  deviceId?: string;
  gameId?: string;
  referee?: string;
  result?: string;
  winnerTeam?: string;
  gameRating?: string;
  set1TeamA?: string;
  set1TeamB?: string;
  set2TeamA?: string;
  set2TeamB?: string;
  set3TeamA?: string;
  set3TeamB?: string;
  completed?: boolean;
  pointHistory?: string;
};

const gameSelect =
  "id,tournament_id,number,round,game_date,court,display_order,team_a,team_b,referee,result,winner_team,game_rating,set1_team_a,set1_team_b,set2_team_a,set2_team_b,set3_team_a,set3_team_b,printed,dirty,completed,point_history,score_locked_by_device,score_locked_at,score_blocked_device,score_blocked_until,score_revision";

const scoreLockTimeout = "30 minutes";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const requestStarted = performance.now();
  const url = new URL(req.url);
  let body: SubmitScoreRequest | null = null;
  if (req.method === "POST") {
    const contentLength = Number.parseInt(req.headers.get("content-length") ?? "0", 10);
    if (contentLength > 64_000) {
      return jsonResponse({ error: "Request body is too large" }, 413);
    }
    try {
      const rawBody = await req.text();
      if (rawBody.length > 64_000) {
        return jsonResponse({ error: "Request body is too large" }, 413);
      }
      const parsedBody = JSON.parse(rawBody) as unknown;
      if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
        return jsonResponse({ error: "Request body must be a JSON object" }, 400);
      }
      body = parsedBody as SubmitScoreRequest;
    } catch {
      return jsonResponse({ error: "Request body must be valid JSON" }, 400);
    }
  }
  const tokenValue: unknown = body?.token ?? url.searchParams.get("token") ?? "";
  const deviceIdValue: unknown = body?.deviceId ?? url.searchParams.get("deviceId") ?? "";

  if (typeof tokenValue !== "string" || !tokenValue) {
    return jsonResponse({ error: "token is required" }, 400);
  }
  if (typeof deviceIdValue !== "string") {
    return jsonResponse({ error: "Invalid deviceId" }, 400);
  }
  const token = tokenValue;
  const deviceId = deviceIdValue;
  if (token.length > 256 || deviceId.length > 160) {
    return jsonResponse({ error: "Invalid token or deviceId" }, 400);
  }

  const adminClient = createAdminClient();
  const hashStarted = performance.now();
  const tokenHash = await sha256Hex(token);
  const hashMs = performance.now() - hashStarted;
  if (req.method === "GET") {
    const { data: link, error: linkError } = await adminClient
      .from("score_entry_links")
      .select("id, tournament_id, game_id, court, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (linkError) {
      return jsonResponse({ error: linkError.message }, 500);
    }

    if (!link) {
      return jsonResponse({ error: "Invalid token" }, 404);
    }

    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      return jsonResponse({ error: "Token expired" }, 410);
    }


    let query = adminClient
      .from("games")
      .select(gameSelect)
      .eq("tournament_id", link.tournament_id)
      .order("number", { ascending: true });

    if (link.game_id) {
      query = query.eq("id", link.game_id);
    } else if (link.court) {
      query = query.eq("court", link.court);
    }

    const { data: games, error: gamesError } = await query;
    if (gamesError) {
      return jsonResponse({ error: gamesError.message }, 500);
    }

    const candidateGames = sortGames(games ?? []);
    let lockGame = link.court && !link.game_id
      ? candidateGames.find((game) => !game.completed)
      : candidateGames[0];

    if (link.court && !link.game_id && deviceId) {
      const { data: courtLock, error: courtLockError } = await adminClient
        .from("score_court_locks")
        .select("active_game_id,active_device_id,locked_at")
        .eq("tournament_id", link.tournament_id)
        .eq("court", link.court.trim())
        .maybeSingle();
      if (courtLockError) {
        return jsonResponse({ error: courtLockError.message }, 500);
      }
      const lockedAt = courtLock?.locked_at ? new Date(courtLock.locked_at).getTime() : 0;
      const sameDeviceLockIsActive = courtLock?.active_device_id === deviceId
        && lockedAt >= Date.now() - 30 * 60 * 1000;
      if (sameDeviceLockIsActive) {
        lockGame = candidateGames.find((game) => game.id === courtLock.active_game_id && !game.completed) ?? lockGame;
      }
    }

    if (lockGame && !lockGame.completed) {
      if (!deviceId) {
        return jsonResponse({ error: "Dieses Geraet konnte nicht erkannt werden. Bitte Link neu oeffnen." }, 403);
      }
      const { data: acquiredGame, error: lockError } = await adminClient.rpc("acquire_score_game_lock", {
        p_game_id: lockGame.id,
        p_tournament_id: link.tournament_id,
        p_device_id: deviceId,
        p_stale_after: scoreLockTimeout,
      });
      if (lockError) {
        return scoreDatabaseError(lockError.message);
      }
      Object.assign(lockGame, acquiredGame);
    }

    const { data: teamRows, error: teamsError } = await adminClient
      .from("games")
      .select("team_a,team_b")
      .eq("tournament_id", link.tournament_id);

    if (teamsError) {
      return jsonResponse({ error: teamsError.message }, 500);
    }

    const allTeams = [...new Set((teamRows ?? [])
      .flatMap((game) => [game.team_a, game.team_b])
      .map((team) => (team ?? "").trim())
      .filter((team) => team && team !== "(Freilos)"))]
      .sort(refereeOptionComparator);

    const responseGames = link.court && !link.game_id
      ? (lockGame ? [lockGame] : [])
      : candidateGames;

    return jsonResponse({
      link,
      games: responseGames,
      allTeams,
    });
  }

  const gameId = body?.gameId ?? null;
  if (gameId !== null && (typeof gameId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gameId))) {
    return jsonResponse({ error: "Invalid gameId" }, 400);
  }
  if (body?.action === "sync-status") {
    const { data, error } = await adminClient.rpc("score_delivery_status", { p_token_hash: tokenHash, p_game_id: gameId });
    return error ? scoreDatabaseError(error.message) : jsonResponse({ status: data });
  }
  if (!deviceId) return jsonResponse({ error: "Dieses Geraet konnte nicht erkannt werden. Bitte Link neu oeffnen." }, 403);
  const reliable = body?.protocol === 2 && body.action !== "heartbeat";
  if (reliable) {
    const delta = body?.historyDelta;
    if (!body?.operationId || !/^[0-9a-f-]{36}$/i.test(body.operationId) || !Number.isSafeInteger(body.baseRevision) || body.baseRevision! < 0
      || !delta || !Number.isInteger(delta.drop) || !Number.isInteger(delta.keep) || delta.drop < 0 || delta.keep < 0 || delta.drop > 120 || delta.keep > 120 || !Array.isArray(delta.append) || delta.append.length + delta.keep > 120) {
      return jsonResponse({ error: "Invalid score operation" }, 400);
    }
  }
  let validated;
  const validationStarted = performance.now();
  try {
    validated = body?.action === "heartbeat" ? null : validateScoreSubmission(reliable ? { ...body, pointHistory: JSON.stringify(body!.historyDelta!.append) } : body ?? {}, { team_a: "1", team_b: "2" });
  } catch (error) {
    if (error instanceof ScoreValidationError) return jsonResponse({ error: error.message }, 400);
    throw error;
  }
  const validationMs = performance.now() - validationStarted;
  const dbStarted = performance.now();
  const { data: updatedGame, error: updateError } = reliable
    ? await adminClient.rpc("submit_score_operation", {
      p_token_hash: tokenHash, p_game_id: gameId, p_device_id: deviceId,
      p_operation_id: body!.operationId, p_revision: body!.baseRevision,
      p_score: { ...validated, pointHistory: null }, p_history_delta: body!.historyDelta,
    })
    : await adminClient.rpc("submit_score_atomic", {
      p_token_hash: tokenHash, p_game_id: gameId, p_device_id: deviceId,
      p_score: validated, p_heartbeat: body?.action === "heartbeat",
    });
  const dbMs = performance.now() - dbStarted;
  if (updateError) {
    if (updateError.message.includes("score_token_invalid")) return jsonResponse({ error: "Invalid token" }, 404);
    if (updateError.message.includes("score_token_expired")) return jsonResponse({ error: "Token expired" }, 410);
    return scoreDatabaseError(updateError.message);
  }
  const completed = validated?.completed ?? false;
  if (completed && (reliable ? updatedGame?.hvvStatus === "queued" && !updatedGame.replayed : updatedGame?.edit_url)) {
    EdgeRuntime.waitUntil(processHvvDelivery(adminClient).catch(() => {
      console.error("HVV background attempt failed; durable job will be retried");
    }));
  }
  const response = jsonResponse(reliable ? updatedGame : { ok: true, hvvStatus: completed ? (updatedGame?.edit_url ? "queued" : "not_configured") : null });
  response.headers.set("Server-Timing", `hash;dur=${hashMs.toFixed(2)}, validate;dur=${validationMs.toFixed(2)}, database;dur=${dbMs.toFixed(2)}, total;dur=${(performance.now()-requestStarted).toFixed(2)}`);
  response.headers.set("Access-Control-Expose-Headers", "Server-Timing");
  return response;
});

function sortGames<T extends { number: string | null; display_order?: number | null }>(games: T[]) {
  return [...games].sort((left, right) =>
    gameOrderSortKey(left) - gameOrderSortKey(right)
    || (left.number ?? "").localeCompare(right.number ?? "", "de", { numeric: true })
  );
}

function gameOrderSortKey(game: { number: string | null; display_order?: number | null }) {
  return game.display_order ?? gameNumberSortKey(game.number);
}

function gameNumberSortKey(number: string | null) {
  const match = (number ?? "").match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : Number.MAX_SAFE_INTEGER;
}

function scoreDatabaseError(message: string) {
  if (message.includes("score_revision_conflict")) return jsonResponse({ error: "Das Spiel wurde zwischenzeitlich geändert. Lokale Eingaben bleiben erhalten; bitte mit der Turnierleitung abgleichen.", code: "revision_conflict" }, 409);
  if (message.includes("score_protocol_upgrade_required")) return jsonResponse({ error: "Bitte diese ältere Erfassungsseite neu laden.", code: "upgrade_required" }, 409);
  if (message.includes("score_operation_mismatch")) return jsonResponse({ error: "Die Bestätigung passt nicht zum gespeicherten Vorgang.", code: "operation_mismatch" }, 409);
  if (message.includes("score_invalid_")) return jsonResponse({ error: "Ungültige Spielstandsänderung." }, 400);
  if (message.includes("score_lock_conflict")) {
    return jsonResponse({ error: "Dieses Spiel wird bereits auf einem anderen Geraet erfasst." }, 423);
  }
  if (message.includes("score_device_cooldown")) {
    return jsonResponse({ error: "Dieses Geraet ist fuer den Court voruebergehend gesperrt. Bitte beim Admin melden." }, 423);
  }
  if (message.includes("score_game_completed")) {
    return jsonResponse({ error: "Das Spiel ist bereits abgeschlossen." }, 409);
  }
  if (message.includes("score_game_not_allowed") || message.includes("score_game_not_found")) {
    return jsonResponse({ error: "Game is not allowed for this token" }, 403);
  }
  if (message.includes("score_device_required")) {
    return jsonResponse({ error: "Dieses Geraet konnte nicht erkannt werden. Bitte Link neu oeffnen." }, 403);
  }
  return jsonResponse({ error: message }, 500);
}

function refereeOptionComparator(left: string, right: string) {
  return Number(isUnresolvedTeamReference(left)) - Number(isUnresolvedTeamReference(right))
    || left.localeCompare(right, "de", { numeric: true });
}

function isUnresolvedTeamReference(value: string) {
  return /\b(?:gewinner|sieger|verlierer)\s+(?:(?:aus|von)\s+)?(?:spiel|match|partie)\b/i.test(value)
    || /\b(?:pool|gruppe)\s+[a-z0-9-]+\s+(?:platz|rang)\s*\d+\b/i.test(value)
    || /\b(?:platz|rang)\s*\d+\s+(?:(?:aus|von)\s+)?(?:pool|gruppe)\b/i.test(value);
}
