import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { sha256Hex } from "../_shared/token.ts";
import { hvvCredentialsFromEnv, refreshTournamentGamesFromHvv, submitGameToHvv } from "../_shared/hvv.ts";
import { ScoreValidationError, validateScoreSubmission } from "../_shared/score-validation.ts";

type SubmitScoreRequest = {
  token: string;
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
  "id,tournament_id,number,round,game_date,court,display_order,team_a,team_b,referee,result,winner_team,game_rating,set1_team_a,set1_team_b,set2_team_a,set2_team_b,set3_team_a,set3_team_b,printed,dirty,completed,point_history,score_locked_by_device,score_locked_at";

const scoreLockTimeout = "30 minutes";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

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
  const tokenHash = await sha256Hex(token);
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

  if (req.method === "GET") {
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
    const lockGame = link.court && !link.game_id
      ? candidateGames.find((game) => !game.completed)
      : candidateGames[0];

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

  const gameIdValue: unknown = body?.gameId ?? link.game_id;
  if (typeof gameIdValue !== "string" || !gameIdValue) {
    return jsonResponse({ error: "gameId is required for court links" }, 400);
  }
  if (gameIdValue.length > 128) {
    return jsonResponse({ error: "Invalid gameId" }, 400);
  }
  const gameId = gameIdValue;

  const { data: game, error: gameError } = await adminClient
    .from("games")
    .select("id, tournament_id, court, team_a, team_b, completed, score_locked_by_device")
    .eq("id", gameId)
    .maybeSingle();

  if (gameError) {
    return jsonResponse({ error: gameError.message }, 500);
  }

  if (!game || game.tournament_id !== link.tournament_id || (link.court && game.court !== link.court)) {
    return jsonResponse({ error: "Game is not allowed for this token" }, 403);
  }

  if (!deviceId) {
    return jsonResponse({ error: "Dieses Geraet konnte nicht erkannt werden. Bitte Link neu oeffnen." }, 403);
  }

  let validated;
  try {
    validated = validateScoreSubmission(body ?? {}, game);
  } catch (error) {
    if (error instanceof ScoreValidationError) {
      return jsonResponse({ error: error.message }, 400);
    }
    throw error;
  }

  const completed = validated.completed;

  const { data: updatedGame, error: updateError } = await adminClient.rpc("save_score_game", {
    p_game_id: game.id,
    p_tournament_id: link.tournament_id,
    p_link_game_id: link.game_id,
    p_link_court: link.court,
    p_device_id: deviceId,
    p_stale_after: scoreLockTimeout,
    p_score: {
      referee: validated.referee,
      result: validated.result,
      winnerTeam: validated.winnerTeam,
      gameRating: validated.gameRating,
      set1TeamA: validated.set1TeamA,
      set1TeamB: validated.set1TeamB,
      set2TeamA: validated.set2TeamA,
      set2TeamB: validated.set2TeamB,
      set3TeamA: validated.set3TeamA,
      set3TeamB: validated.set3TeamB,
      completed,
      pointHistory: validated.pointHistory,
    },
  });

  if (updateError) {
    return scoreDatabaseError(updateError.message);
  }

  let hvvSynced = false;
  let hvvError = "";
  if (completed && updatedGame) {
    try {
      const hvvCredentials = hvvCredentialsFromEnv();
      await submitGameToHvv(updatedGame, hvvCredentials);
      const { error: cleanError } = await adminClient
        .from("games")
        .update({ dirty: false })
        .eq("id", game.id);
      if (cleanError) {
        hvvError = cleanError.message;
      } else {
        await refreshTournamentGamesFromHvv(adminClient, updatedGame.tournament_id, hvvCredentials);
        hvvSynced = true;
      }
    } catch (error) {
      hvvError = error instanceof Error ? error.message : String(error);
    }
  }

  await adminClient
    .from("score_entry_links")
    .update({ used_at: new Date().toISOString() })
    .eq("id", link.id);

  return jsonResponse({ ok: true, hvvSynced, hvvError: hvvError || null });
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
  if (message.includes("score_lock_conflict")) {
    return jsonResponse({ error: "Dieses Spiel wird bereits auf einem anderen Geraet erfasst." }, 423);
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
