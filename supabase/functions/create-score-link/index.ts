import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, createUserClient } from "../_shared/supabase.ts";
import { randomToken, sha256Hex } from "../_shared/token.ts";

type CreateScoreLinkRequest = {
  tournamentId: string;
  gameId?: string;
  court?: string;
  expiresAt?: string;
};

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
    .select("user_id,role")
    .eq("user_id", userData.user.id)
    .eq("password_setup_required", false)
    .maybeSingle();

  if (adminError || !adminUser) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }

  const body = await req.json() as CreateScoreLinkRequest;
  if (!body.tournamentId || (!body.gameId && !body.court)) {
    return jsonResponse({ error: "tournamentId and gameId or court are required" }, 400);
  }

  if (adminUser.role !== "superadmin") {
    const { data: assignment, error: assignmentError } = await adminClient
      .from("tournament_admins")
      .select("tournament_id")
      .eq("tournament_id", body.tournamentId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (assignmentError || !assignment) {
      return jsonResponse({ error: "Not authorized for this tournament" }, 403);
    }
  }

  if (body.gameId) {
    const { data: game, error: gameError } = await adminClient
      .from("games")
      .select("id")
      .eq("id", body.gameId)
      .eq("tournament_id", body.tournamentId)
      .maybeSingle();

    if (gameError || !game) {
      return jsonResponse({ error: gameError?.message ?? "Game not found in tournament" }, 404);
    }
  }

  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const { data, error } = await adminClient
    .from("score_entry_links")
    .insert({
      tournament_id: body.tournamentId,
      game_id: body.gameId ?? null,
      court: body.court ?? null,
      token,
      token_hash: tokenHash,
      expires_at: body.expiresAt ?? null,
      created_by: userData.user.id,
    })
    .select("id")
    .single();

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({
    id: data.id,
    token,
  });
});
