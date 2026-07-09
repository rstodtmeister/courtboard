import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, createUserClient } from "../_shared/supabase.ts";

type AdminRole = "superadmin" | "admin";

type InviteAdminRequest = {
  email?: string;
  role?: AdminRole;
};

type AdminPayload = {
  user_id: string;
  email: string;
  role: AdminRole;
  created_at: string;
  email_confirmed_at: string | null;
  banned_until?: string | null;
  last_sign_in_at?: string | null;
};

type DeleteAdminRequest = {
  userId?: string;
};

type AdminAction = "confirm" | "resendInvite" | "updateRole" | "setSuspended";

type UpdateAdminRequest = {
  userId?: string;
  action?: AdminAction;
  role?: AdminRole;
  suspended?: boolean;
};

function authRedirectUrl(req: Request) {
  const configuredUrl = Deno.env.get("ADMIN_APP_URL");
  if (configuredUrl) {
    const url = new URL(configuredUrl);
    url.search = "";
    url.hash = "";
    url.searchParams.set("auth", "confirmed");
    return url.toString();
  }

  const referer = req.headers.get("referer");
  const origin = req.headers.get("origin");
  const baseUrl = referer ?? origin;
  if (!baseUrl) {
    return undefined;
  }
  const url = new URL(baseUrl);
  if (isLocalUrl(url)) {
    return undefined;
  }
  url.search = "";
  url.hash = "";
  url.searchParams.set("auth", "confirmed");
  return url.toString();
}

function isLocalUrl(url: URL) {
  const hostname = url.hostname.toLowerCase();
  return hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  if (req.method !== "GET" && req.method !== "POST" && req.method !== "PATCH" && req.method !== "DELETE") {
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

  if (req.method === "PATCH") {
    return updateAdmin(req, adminClient, userData.user.id);
  }

  const body = await req.json() as InviteAdminRequest;
  const email = body.email?.trim().toLowerCase();
  const role = body.role === "superadmin" ? "superadmin" : "admin";

  if (!email) {
    return jsonResponse({ error: "email is required" }, 400);
  }

  return inviteAdmin(req, adminClient, userData.user.id, email, role);
});

async function inviteAdmin(
  req: Request,
  adminClient: ReturnType<typeof createAdminClient>,
  invitedBy: string,
  email: string,
  role: AdminRole,
) {
  let inviteEmailSent = true;
  let emailError: string | null = null;

  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    email,
    {
      data: { role },
      redirectTo: authRedirectUrl(req),
    },
  );

  let user = invited.user;

  if (inviteError || !user) {
    inviteEmailSent = false;
    emailError = inviteError?.message ?? "Invite email could not be sent.";

    const existingUser = await findUserByEmail(adminClient, email);
    if ("error" in existingUser) {
      return existingUser.error;
    }

    if (existingUser.user) {
      user = existingUser.user;
    } else {
      const created = await adminClient.auth.admin.createUser({
        email,
        email_confirm: false,
        user_metadata: { role },
      });

      if (created.error || !created.data.user) {
        return jsonResponse({ error: created.error?.message ?? emailError }, 500);
      }

      user = created.data.user;
    }
  }

  const { data: row, error: upsertError } = await adminClient
    .from("admin_users")
    .upsert({
      user_id: user.id,
      role,
      invited_by: invitedBy,
    }, { onConflict: "user_id" })
    .select("user_id,role,created_at")
    .single();

  if (upsertError) {
    return jsonResponse({ error: upsertError.message }, 500);
  }

  const admin = await adminFromUser(adminClient, row, user.email ?? email);
  return jsonResponse({
    admin,
    invite_email_sent: inviteEmailSent,
    warning: inviteEmailSent ? null : emailError,
  });
}

async function updateAdmin(
  req: Request,
  adminClient: ReturnType<typeof createAdminClient>,
  currentUserId: string,
) {
  const body = await req.json() as UpdateAdminRequest;
  const userId = body.userId?.trim();

  if (!userId) {
    return jsonResponse({ error: "userId is required" }, 400);
  }

  if (!body.action) {
    return jsonResponse({ error: "action is required" }, 400);
  }

  const target = await getAdminRow(adminClient, userId);
  if ("error" in target) {
    return target.error;
  }

  if (body.action === "confirm") {
    const { error } = await adminClient.auth.admin.updateUserById(userId, { email_confirm: true });
    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }
    return adminPayload(adminClient, target.row);
  }

  if (body.action === "resendInvite") {
    const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(userId);
    const email = userData.user?.email;
    if (userError || !email) {
      return jsonResponse({ error: userError?.message ?? "Admin email not found" }, 500);
    }
    const { error } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { role: target.row.role },
      redirectTo: authRedirectUrl(req),
    });
    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }
    return adminPayload(adminClient, target.row);
  }

  if (body.action === "updateRole") {
    const role = body.role === "superadmin" ? "superadmin" : "admin";
    if (target.row.role === "superadmin" && role !== "superadmin") {
      const protection = await ensureCanRemoveSuperadmin(adminClient, userId, currentUserId, "degradieren");
      if (protection) {
        return protection;
      }
    }
    const { data: row, error } = await adminClient
      .from("admin_users")
      .update({ role })
      .eq("user_id", userId)
      .select("user_id,role,created_at")
      .single();
    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }
    await adminClient.auth.admin.updateUserById(userId, { user_metadata: { role } });
    return adminPayload(adminClient, row);
  }

  if (body.action === "setSuspended") {
    if (body.suspended) {
      if (userId === currentUserId) {
        return jsonResponse({ error: "Du kannst deinen eigenen Zugang nicht sperren." }, 400);
      }
      if (target.row.role === "superadmin") {
        const protection = await ensureCanRemoveSuperadmin(adminClient, userId, currentUserId, "sperren");
        if (protection) {
          return protection;
        }
      }
    }
    const { error } = await adminClient.auth.admin.updateUserById(userId, {
      ban_duration: body.suspended ? "876000h" : "none",
    });
    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }
    return adminPayload(adminClient, target.row);
  }

  return jsonResponse({ error: "Unknown action" }, 400);
}

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

  const target = await getAdminRow(adminClient, userId);
  if ("error" in target) {
    return target.error;
  }

  if (target.row.role === "superadmin") {
    const protection = await ensureCanRemoveSuperadmin(adminClient, userId, currentUserId, "loeschen");
    if (protection) {
      return protection;
    }
  } else if (userId === currentUserId) {
    return jsonResponse({ error: "Du kannst deinen eigenen Superadmin-Zugang nicht loeschen." }, 400);
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteError) {
    return jsonResponse({ error: deleteError.message }, 500);
  }

  return jsonResponse({ ok: true });
}

async function getAdminRow(adminClient: ReturnType<typeof createAdminClient>, userId: string): Promise<
  | { row: { user_id: string; role: AdminRole; created_at: string } }
  | { error: Response }
> {
  const { data, error } = await adminClient
    .from("admin_users")
    .select("user_id,role,created_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { error: jsonResponse({ error: error.message }, 500) };
  }

  if (!data) {
    return { error: jsonResponse({ error: "Admin not found" }, 404) };
  }

  return { row: data };
}

async function ensureCanRemoveSuperadmin(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  currentUserId: string,
  action: string,
) {
  if (userId === currentUserId) {
    return jsonResponse({ error: `Du kannst deinen eigenen Superadmin-Zugang nicht ${action}.` }, 400);
  }

  const { count, error } = await adminClient
    .from("admin_users")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "superadmin");

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  if ((count ?? 0) <= 1) {
    return jsonResponse({ error: `Der letzte Superadmin kann nicht ${action} werden.` }, 400);
  }

  return null;
}

async function adminPayload(
  adminClient: ReturnType<typeof createAdminClient>,
  row: { user_id: string; role: AdminRole; created_at: string },
) {
  const { data } = await adminClient.auth.admin.getUserById(row.user_id);
  return jsonResponse({ admin: adminFromAuthUser(row, data.user) });
}

async function adminFromUser(
  adminClient: ReturnType<typeof createAdminClient>,
  row: { user_id: string; role: AdminRole; created_at: string },
  fallbackEmail = "",
) {
  const { data } = await adminClient.auth.admin.getUserById(row.user_id);
  return adminFromAuthUser(row, data.user, fallbackEmail);
}

function adminFromAuthUser(
  row: { user_id: string; role: AdminRole; created_at: string },
  user: {
    email?: string;
    email_confirmed_at?: string | null;
    banned_until?: string | null;
    last_sign_in_at?: string | null;
  } | null,
  fallbackEmail = "",
): AdminPayload {
  return {
    user_id: row.user_id,
    email: user?.email ?? fallbackEmail,
    role: row.role,
    created_at: row.created_at,
    email_confirmed_at: user?.email_confirmed_at ?? null,
    banned_until: user?.banned_until ?? null,
    last_sign_in_at: user?.last_sign_in_at ?? null,
  };
}

async function findUserByEmail(
  adminClient: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<{ user: { id: string; email?: string; created_at: string; email_confirmed_at?: string | null } | null } | { error: Response }> {
  const normalizedEmail = email.toLowerCase();

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      return { error: jsonResponse({ error: error.message }, 500) };
    }

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === normalizedEmail);
    if (user) {
      return { user };
    }

    if (data.users.length < 1000) {
      return { user: null };
    }
  }

  return { user: null };
}

async function listAdmins(adminClient: ReturnType<typeof createAdminClient>) {
  const { data: rows, error } = await adminClient
    .from("admin_users")
    .select("user_id,role,created_at")
    .order("created_at", { ascending: true });

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  const admins = await Promise.all((rows ?? []).map((row) => adminFromUser(adminClient, row)));

  return jsonResponse({ admins });
}
