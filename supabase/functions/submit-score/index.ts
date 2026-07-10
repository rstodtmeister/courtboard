import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { sha256Hex } from "../_shared/token.ts";
import { hvvCredentialsFromEnv, refreshTournamentGamesFromHvv, submitGameToHvv } from "../_shared/hvv.ts";

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
  "id,tournament_id,number,game_date,court,team_a,team_b,referee,result,winner_team,game_rating,set1_team_a,set1_team_b,set2_team_a,set2_team_b,set3_team_a,set3_team_b,printed,dirty,completed,point_history,score_locked_by_device,score_locked_at";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const url = new URL(req.url);
  const body = req.method === "POST" ? await req.json() as SubmitScoreRequest : null;
  const token = body?.token ?? url.searchParams.get("token") ?? "";
  const deviceId = body?.deviceId ?? url.searchParams.get("deviceId") ?? "";

  if (!token) {
    return jsonResponse({ error: "token is required" }, 400);
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

    const candidateGames = games ?? [];
    const lockGame = link.court && !link.game_id
      ? candidateGames.find((game) => !game.completed)
      : candidateGames[0];

    if (lockGame && !lockGame.completed) {
      if (!deviceId) {
        return jsonResponse({ error: "Dieses Geraet konnte nicht erkannt werden. Bitte Link neu oeffnen." }, 403);
      }
      if (lockGame.score_locked_by_device && lockGame.score_locked_by_device !== deviceId) {
        return jsonResponse({ error: "Dieses Spiel wird bereits auf einem anderen Geraet erfasst." }, 423);
      }
      if (!lockGame.score_locked_by_device) {
        const lockedAt = new Date().toISOString();
        const { error: lockError } = await adminClient
          .from("games")
          .update({
            score_locked_by_device: deviceId,
            score_locked_at: lockedAt,
          })
          .eq("id", lockGame.id);

        if (lockError) {
          return jsonResponse({ error: lockError.message }, 500);
        }

        lockGame.score_locked_by_device = deviceId;
        lockGame.score_locked_at = lockedAt;
      }
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
      .sort((left, right) => left.localeCompare(right, "de", { numeric: true }));

    const responseGames = link.court && !link.game_id
      ? (lockGame ? [lockGame] : [])
      : candidateGames;

    return jsonResponse({
      link,
      games: responseGames,
      allTeams,
    });
  }

  const gameId = body?.gameId ?? link.game_id;
  if (!gameId) {
    return jsonResponse({ error: "gameId is required for court links" }, 400);
  }

  const { data: game, error: gameError } = await adminClient
    .from("games")
    .select("id, tournament_id, court, score_locked_by_device")
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

  if (game.score_locked_by_device && game.score_locked_by_device !== deviceId) {
    return jsonResponse({ error: "Dieses Spiel wird bereits auf einem anderen Geraet erfasst." }, 423);
  }

  const completed = body?.completed ?? false;

  const { data: updatedGame, error: updateError } = await adminClient
    .from("games")
    .update({
      score_locked_by_device: completed ? null : deviceId,
      score_locked_at: completed ? null : new Date().toISOString(),
      referee: body?.referee ?? "",
      result: body?.result ?? "",
      winner_team: body?.winnerTeam ?? "",
      game_rating: body?.gameRating ?? "Normal",
      set1_team_a: body?.set1TeamA ?? "",
      set1_team_b: body?.set1TeamB ?? "",
      set2_team_a: body?.set2TeamA ?? "",
      set2_team_b: body?.set2TeamB ?? "",
      set3_team_a: body?.set3TeamA ?? "",
      set3_team_b: body?.set3TeamB ?? "",
      completed,
      point_history: body?.pointHistory ?? null,
      dirty: true,
    })
    .eq("id", game.id)
    .select("id,tournament_id,number,edit_url,edit_method,edit_data,court,referee,game_rating,set1_team_a,set1_team_b,set2_team_a,set2_team_b,set3_team_a,set3_team_b")
    .single();

  if (updateError) {
    return jsonResponse({ error: updateError.message }, 500);
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
