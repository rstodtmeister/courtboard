import { clearHvvCredentials, currentAdminRole, dataMode, getSupabase, updateStore, readStore } from "./dataApiCore";
import type { AppSession } from "./types";

export async function getSession(): Promise<AppSession | null> {
  if (dataMode === "local") {
    return readStore().session;
  }

  const { data } = await getSupabase().auth.getSession();
  const user = data.session?.user;
  if (!user?.email) {
    return null;
  }

  const role = await currentAdminRole(user.id);
  if (!role) {
    await getSupabase().auth.signOut();
    return null;
  }

  return { user: { email: user.email, role } };
}

export async function completeAuthRedirect(): Promise<{ email?: string; error?: string }> {
  if (dataMode === "local") {
    return { email: "admin@local.test" };
  }

  const params = new URLSearchParams(window.location.search);
  const redirectError = params.get("error_description") ?? params.get("error");
  if (redirectError) {
    return { error: redirectError };
  }
  const code = params.get("code");
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  if (code) {
    const { error } = await getSupabase().auth.exchangeCodeForSession(code);
    if (error) {
      return { error: error.message };
    }
  } else if (hashParams.has("access_token") || hashParams.has("refresh_token")) {
    await getSupabase().auth.getSession();
  }

  const { data } = await getSupabase().auth.getSession();
  const email = data.session?.user.email;
  if (!email) {
    return { error: "Die Einladung konnte nicht bestaetigt werden. Bitte fordere eine neue Einladung an." };
  }

  return { email };
}

export async function requestPasswordReset(email: string): Promise<{ error?: string }> {
  if (dataMode === "local") {
    return { error: "Passwort-Reset ist im lokalen Modus nicht verfuegbar." };
  }

  try {
    const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${loginUrl()}?auth=recover`,
    });
    return error ? { error: error.message } : {};
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unbekannter Fehler";
    return {
      error: `Reset-E-Mail konnte nicht angefordert werden (${detail}). Pruefe VITE_SUPABASE_URL, Netzwerkzugriff und die erlaubte Redirect-URL ?auth=recover in Supabase Auth.`,
    };
  }
}

export async function setAdminPassword(password: string): Promise<{ error?: string }> {
  if (dataMode === "local") {
    return {};
  }

  const { error } = await getSupabase().auth.updateUser({ password });
  if (error) {
    return { error: error.message };
  }

  const { error: statusError } = await getSupabase().rpc("mark_admin_password_setup_complete");
  if (statusError) {
    return { error: statusError.message };
  }

  await getSupabase().auth.signOut();
  return {};
}

export function onSessionChange(callback: (session: AppSession | null) => void) {
  if (dataMode === "local") {
    const listener = (event: StorageEvent) => {
      if (event.key === "courtboard.localData.v1") {
        callback(readStore().session);
      }
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }

  const { data } = getSupabase().auth.onAuthStateChange((_event, session) => {
    const user = session?.user;
    if (!user?.email) {
      callback(null);
      return;
    }
    currentAdminRole(user.id).then((role) => {
      if (!role) {
        callback(null);
        return;
      }
      callback({ user: { email: user.email!, role } });
    });
  });

  return () => data.subscription.unsubscribe();
}

export async function signIn(email: string, password: string): Promise<{ error?: string }> {
  if (dataMode === "local") {
    if (!email || !password) {
      return { error: "E-Mail und Passwort sind erforderlich." };
    }

    const admin = readStore().admins.find((item) => item.email.toLowerCase() === email.toLowerCase());
    updateStore({ session: { user: { email, role: admin?.role ?? "admin" } } });
    return {};
  }

  const { error } = await getSupabase().auth.signInWithPassword({ email, password });
  return error ? { error: error.message } : {};
}

export async function signOut() {
  clearHvvCredentials();
  if (dataMode === "local") {
    updateStore({ session: null });
    return;
  }

  await getSupabase().auth.signOut();
}

function loginUrl() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
}
