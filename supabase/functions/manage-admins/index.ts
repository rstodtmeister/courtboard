import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, createUserClient } from "../_shared/supabase.ts";

type AdminRole = "superadmin" | "admin";

type InviteAdminRequest = {
  email?: string;
  role?: AdminRole;
};

type DeleteAdminRequest = {
  userId?: string;
};

function authRedirectUrl(req: Request) {
  const referer = req.headers.get("referer");
  const origin = req.headers.get("origin");
  const baseUrl = referer ?? origin;
  if (!baseUrl) {
    return undefined;
  }
  const url = new URL(baseUrl);
  url.search = "";
  url.hash = "";
  url.searchParams.set("auth", "confirmed");
  return url.toString();
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  if (req.method !== "GET" && req.method !== "POST" && req.method !== "DELETE") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const userClient = createUserClient(req);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }

  const adminClient = createAdminClient();
  const { data: currentAdmin, error: currentAdminError } = await adminClient
    .from("admin_users")
    .select("user_id,role")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (currentAdminError || !currentAdmin || currentAdmin.role !== "superadmin") {
    return jsonResponse({ error: "Not authorized" }, 403);
  }

  if (req.method === "GET") {
    return listAdmins(adminClient);
  }

  if (req.method === "DELETE") {
    return deleteAdmin(req, adminClient, userData.user.id);
  }

  const body = await req.json() as InviteAdminRequest;
  const email = body.email?.trim().toLowerCase();
  const role = body.role === "superadmin" ? "superadmin" : "admin";

  if (!email) {
    return jsonResponse({ error: "email is required" }, 400);
  }

  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    email,
    {
      data: { role },
      redirectTo: authRedirectUrl(req),
    },
  );

  if (inviteError || !invited.user) {
    return jsonResponse({ error: inviteError?.message ?? "Invite failed" }, 500);
  }

  const { error: upsertError } = await adminClient
    .from("admin_users")
    .upsert({
      user_id: invited.user.id,
      role,
      invited_by: userData.user.id,
    }, { onConflict: "user_id" });

  if (upsertError) {
    return jsonResponse({ error: upsertError.message }, 500);
  }

  return jsonResponse({
    admin: {
      user_id: invited.user.id,
      email: invited.user.email ?? email,
      role,
      created_at: invited.user.created_at,
      email_confirmed_at: invited.user.email_confirmed_at,
    },
  });
});

async function deleteAdmin(
  req: Request,
  adminClient: ReturnType<typeof createAdminClient>,
  currentUserId: string,
) {
  const body = await req.json() as DeleteAdminRequest;
  const userId = body.userId?.trim();

  if (!userId) {
    return jsonResponse({ error: "userId is required" }, 400);
  }

  const { data: targetAdmin, error: targetError } = await adminClient
    .from("admin_users")
    .select("user_id,role")
    .eq("user_id", userId)
    .maybeSingle();

  if (targetError) {
    return jsonResponse({ error: targetError.message }, 500);
  }

  if (!targetAdmin) {
    return jsonResponse({ error: "Admin not found" }, 404);
  }

  if (targetAdmin.role === "superadmin") {
    const { count, error: countError } = await adminClient
      .from("admin_users")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "superadmin");

    if (countError) {
      return jsonResponse({ error: countError.message }, 500);
    }

    if ((count ?? 0) <= 1) {
      return jsonResponse({ error: "Der letzte Superadmin kann nicht geloescht werden." }, 400);
    }
  }

  if (userId === currentUserId && targetAdmin.role === "superadmin") {
    return jsonResponse({ error: "Du kannst deinen eigenen Superadmin-Zugang nicht loeschen." }, 400);
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteError) {
    return jsonResponse({ error: deleteError.message }, 500);
  }

  return jsonResponse({ ok: true });
}

async function listAdmins(adminClient: ReturnType<typeof createAdminClient>) {
  const { data: rows, error } = await adminClient
    .from("admin_users")
    .select("user_id,role,created_at")
    .order("created_at", { ascending: true });

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  const admins = await Promise.all((rows ?? []).map(async (row) => {
    const { data } = await adminClient.auth.admin.getUserById(row.user_id);
    return {
      user_id: row.user_id,
      email: data.user?.email ?? "",
      role: row.role,
      created_at: row.created_at,
      email_confirmed_at: data.user?.email_confirmed_at ?? null,
    };
  }));

  return jsonResponse({ admins });
}
