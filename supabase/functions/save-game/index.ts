import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, createUserClient } from "../_shared/supabase.ts";
import { type HvvCredentials, submitGameToHvv } from "../_shared/hvv.ts";

type SaveGameRequest = {
  gameId?: string;
  tournamentId?: string;
  mode?: "single" | "dirty";
  hvvCredentials?: HvvCredentials;
};

const hvvGameSelect =
  "id,tournament_id,number,edit_url,edit_method,edit_data,court,referee,game_rating,set1_team_a,set1_team_b,set2_team_a,set2_team_b,set3_team_a,set3_team_b";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const userClient = createUserClient(req);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }

  const adminClient = createAdminClient();
  const { data: adminUser, error: adminError } = await adminClient
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .eq("password_setup_required", false)
    .maybeSingle();

  if (adminError || !adminUser) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }

  const body = await req.json() as SaveGameRequest;
  const credentials = body.hvvCredentials ?? {};
  const mode = body.mode ?? (body.gameId ? "single" : "dirty");

  if (mode === "single") {
    if (!body.gameId) {
      return jsonResponse({ error: "gameId is required" }, 400);
    }
    const { data: game, error: gameError } = await adminClient
      .from("games")
      .select(hvvGameSelect)
      .eq("id", body.gameId)
      .single();

    if (gameError || !game) {
      return jsonResponse({ error: gameError?.message ?? "Game not found" }, 404);
    }

    try {
      await submitGameToHvv(game, credentials);
      await adminClient.from("games").update({ dirty: false }).eq("id", game.id);
      return jsonResponse({ sent: 1, failed: 0, results: [{ gameId: game.id, number: game.number, ok: true }] });
    } catch (error) {
      return jsonResponse({
        sent: 0,
        failed: 1,
        results: [{ gameId: game.id, number: game.number, ok: false, error: errorMessage(error) }],
      }, 500);
    }
  }

  if (!body.tournamentId) {
    return jsonResponse({ error: "tournamentId is required" }, 400);
  }

  const { data: games, error: gamesError } = await adminClient
    .from("games")
    .select(hvvGameSelect)
    .eq("tournament_id", body.tournamentId)
    .eq("dirty", true)
    .order("number", { ascending: true });

  if (gamesError) {
    return jsonResponse({ error: gamesError.message }, 500);
  }

  const results = [];
  let sent = 0;
  let failed = 0;
  for (const game of games ?? []) {
    try {
      await submitGameToHvv(game, credentials);
      await adminClient.from("games").update({ dirty: false }).eq("id", game.id);
      sent++;
      results.push({ gameId: game.id, number: game.number, ok: true });
    } catch (error) {
      failed++;
      results.push({ gameId: game.id, number: game.number, ok: false, error: errorMessage(error) });
    }
  }

  return jsonResponse({ sent, failed, results }, failed > 0 ? 207 : 200);
});

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
