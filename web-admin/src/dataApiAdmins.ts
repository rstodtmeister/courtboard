import { createId, dataMode, getSupabase, readStore, supabaseFunctionErrorMessage, writeStore } from "./dataApiCore";
import type { AdminRole, AdminUser } from "./types";

export async function listAdminUsers(): Promise<AdminUser[]> {
  if (dataMode === "local") {
    return readStore().admins;
  }

  const { data, error } = await getSupabase().functions.invoke<{ admins: AdminUser[] }>("manage-admins", {
    method: "GET",
  });

  if (error || !data) {
    throw new Error(await supabaseFunctionErrorMessage(error, "Admins konnten nicht geladen werden."));
  }

  return data.admins;
}

export type InviteAdminResult = {
  admin: AdminUser;
  inviteEmailSent: boolean;
  warning?: string | null;
};

export async function inviteAdminUser(params: { email: string; role: AdminRole }): Promise<InviteAdminResult> {
  if (dataMode === "local") {
    const store = readStore();
    const existing = store.admins.find((admin) => admin.email.toLowerCase() === params.email.toLowerCase());
    if (existing) {
      throw new Error("Dieser Admin existiert bereits.");
    }
    const admin: AdminUser = {
      user_id: createId("local-admin"),
      email: params.email,
      role: params.role,
      tournament_ids: store.tournaments.map((tournament) => tournament.id),
      password_setup_required: true,
      created_at: new Date().toISOString(),
      email_confirmed_at: null,
    };
    writeStore({ ...store, admins: [...store.admins, admin] });
    return { admin, inviteEmailSent: true, warning: null };
  }

  const { data, error } = await getSupabase().functions.invoke<{ admin: AdminUser; invite_email_sent?: boolean; warning?: string | null }>("manage-admins", {
    body: params,
  });

  if (error || !data) {
    throw new Error(await supabaseFunctionErrorMessage(error, "Admin konnte nicht eingeladen werden."));
  }

  return {
    admin: data.admin,
    inviteEmailSent: data.invite_email_sent ?? true,
    warning: data.warning ?? null,
  };
}

export async function updateAdminUser(params: {
  userId: string;
  action: "confirm" | "resendInvite" | "updateRole" | "setSuspended" | "updateTournaments";
  role?: AdminRole;
  suspended?: boolean;
  tournamentIds?: string[];
}): Promise<AdminUser> {
  if (dataMode === "local") {
    const store = readStore();
    const target = store.admins.find((admin) => admin.user_id === params.userId);
    if (!target) {
      throw new Error("Admin nicht gefunden.");
    }
    const nextAdmin: AdminUser = {
      ...target,
      role: params.action === "updateRole" && params.role ? params.role : target.role,
      tournament_ids: params.action === "updateTournaments" ? params.tournamentIds ?? [] : target.tournament_ids,
      email_confirmed_at: params.action === "confirm" ? new Date().toISOString() : target.email_confirmed_at,
      banned_until: params.action === "setSuspended" && params.suspended ? new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString() : null,
    };
    writeStore({
      ...store,
      admins: store.admins.map((admin) => admin.user_id === params.userId ? nextAdmin : admin),
    });
    return nextAdmin;
  }

  const { data, error } = await getSupabase().functions.invoke<{ admin: AdminUser }>("manage-admins", {
    method: "PATCH",
    body: params,
  });

  if (error || !data) {
    throw new Error(await supabaseFunctionErrorMessage(error, "Admin konnte nicht aktualisiert werden."));
  }

  return data.admin;
}

export async function deleteAdminUser(userId: string): Promise<void> {
  if (dataMode === "local") {
    const store = readStore();
    const target = store.admins.find((admin) => admin.user_id === userId);
    if (!target) {
      throw new Error("Admin nicht gefunden.");
    }
    const superadminCount = store.admins.filter((admin) => admin.role === "superadmin").length;
    if (target.role === "superadmin" && superadminCount <= 1) {
      throw new Error("Der letzte Superadmin kann nicht geloescht werden.");
    }
    writeStore({ ...store, admins: store.admins.filter((admin) => admin.user_id !== userId) });
    return;
  }

  const { error } = await getSupabase().functions.invoke("manage-admins", {
    method: "DELETE",
    body: { userId },
  });

  if (error) {
    throw new Error(await supabaseFunctionErrorMessage(error, "Admin konnte nicht geloescht werden."));
  }
}
