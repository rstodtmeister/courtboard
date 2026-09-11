import { clearHvvCredentials, dataMode, getSupabase, updateStore, readStore } from "./dataApiCore";
import type { AppSession } from "./types";

const sessionNoticeKey = "courtboard.sessionNotice";
const sessionEndedEvent = "courtboard:session-ended";
const replacedMessage = "Du wurdest abgemeldet, weil dein Konto auf einem anderen Gerät angemeldet wurde.";

export function getSessionNotice() {
  return window.sessionStorage.getItem(sessionNoticeKey) ?? "";
}

async function endCurrentSession(accessToken: string, message: string) {
  const client = getSupabase();
  const { data } = await client.auth.getSession();
  // A response for an older login must not log out a newer login in this browser.
  if (data.session?.access_token !== accessToken) return;
  window.sessionStorage.setItem(sessionNoticeKey, message);
  clearHvvCredentials();
  window.dispatchEvent(new Event(sessionEndedEvent));
  // Never revoke the new device's session when dismissing the old one.
  await client.auth.signOut({ scope: "local" });
}

export async function validateAdminSession(): Promise<boolean> {
  if (dataMode === "local") return true;
  const client = getSupabase();
  const { data: authData, error: authError } = await client.auth.getSession();
  if (authError) throw authError;
  if (!authData.session) return false;
  const { data: status, error } = await client.rpc("get_admin_session_status");
  if (error) throw new Error(`Sitzung konnte nicht geprüft werden: ${error.message}`);
  if (status === "superadmin" || status === "admin") return true;
  await endCurrentSession(authData.session.access_token, status === "replaced"
    ? replacedMessage : "Dein Adminzugang ist nicht mehr verfügbar. Bitte melde dich erneut an.");
  return false;
}

export async function getSession(): Promise<AppSession | null> {
  if (dataMode === "local") {
    return readStore().session;
  }

  const { data, error: authError } = await getSupabase().auth.getSession();
  if (authError) throw authError;
  const user = data.session?.user;
  if (!user?.email) {
    return null;
  }

  const { data: role, error } = await getSupabase().rpc("claim_admin_session");
  if (error) throw new Error(`Sitzung konnte nicht geprüft werden: ${error.message}`);
  if (role !== "admin" && role !== "superadmin") {
    await endCurrentSession(data.session!.access_token, role === "replaced"
      ? replacedMessage : "Dein Adminzugang ist nicht verfügbar.");
    return null;
  }

  window.sessionStorage.removeItem(sessionNoticeKey);
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

export function onSessionChange(callback: (session: AppSession | null) => void, onError: (error: Error) => void) {
  if (dataMode === "local") {
    callback(readStore().session);
    const listener = (event: StorageEvent) => {
      if (event.key === "courtboard.localData.v1") {
        callback(readStore().session);
      }
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }

  let generation = 0;
  let timer: number | undefined;
  const ended = () => {
    generation += 1;
    callback(null);
  };
  window.addEventListener(sessionEndedEvent, ended);
  const { data } = getSupabase().auth.onAuthStateChange((_event, session) => {
    const current = ++generation;
    window.clearTimeout(timer);
    if (!session?.user.email) {
      callback(null);
      return;
    }
    // Leave the Auth callback before making another Supabase request.
    timer = window.setTimeout(() => {
      getSession().then((next) => {
        if (current === generation) callback(next);
      }).catch((error) => {
        if (current === generation) onError(error instanceof Error ? error : new Error(String(error)));
      });
    }, 0);
  });

  return () => {
    generation += 1;
    window.clearTimeout(timer);
    window.removeEventListener(sessionEndedEvent, ended);
    data.subscription.unsubscribe();
  };
}

export async function signIn(email: string, password: string): Promise<{ error?: string }> {
  if (dataMode === "local") {
    if (!email || !password) {
      return { error: "E-Mail und Passwort sind erforderlich." };
    }

    const admin = readStore().admins.find((item) => item.email.toLowerCase() === email.toLowerCase());
    updateStore({ session: { user: { email, role: admin?.role ?? "admin" } } });
    window.dispatchEvent(new StorageEvent("storage", { key: "courtboard.localData.v1" }));
    return {};
  }

  const { error } = await getSupabase().auth.signInWithPassword({ email, password });
  return error ? { error: error.message } : {};
}

export async function signOut() {
  clearHvvCredentials();
  window.sessionStorage.removeItem(sessionNoticeKey);
  if (dataMode === "local") {
    updateStore({ session: null });
    window.dispatchEvent(new StorageEvent("storage", { key: "courtboard.localData.v1" }));
    return;
  }

  const { error } = await getSupabase().auth.signOut({ scope: "local" });
  if (error) throw error;
}

function loginUrl() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
}
