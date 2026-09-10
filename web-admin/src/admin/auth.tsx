import React, { FormEvent, useEffect, useState } from "react";
import {
  completeAuthRedirect,
  getSessionNotice,
  onSessionChange,
  requestPasswordReset,
  setAdminPassword,
  signIn,
} from "../dataApi";
import type { AppSession } from "../types";
import { loginUrl } from "./shared";

export function AuthCredentialApp({ mode }: { mode: "invite" | "recover" }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [saving, setSaving] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    completeAuthRedirect().then((result) => {
      if (result.error) {
        setError(result.error);
      } else {
        setEmail(result.email ?? "");
      }
      setLoading(false);
      const url = new URL(window.location.href);
      url.searchParams.delete("code");
      url.searchParams.delete("auth");
      url.hash = "";
      window.history.replaceState({}, "", url.toString());
    });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Das Passwort muss mindestens 6 Zeichen lang sein.");
      return;
    }

    if (password !== passwordRepeat) {
      setError("Die Passwoerter stimmen nicht ueberein.");
      return;
    }

    setSaving(true);
    const result = await setAdminPassword(password);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setComplete(true);
  }

  return (
    <Shell>
      <section className="panel login-panel">
        <h2>{complete ? "Passwort gespeichert" : "Passwort festlegen"}</h2>
        {loading ? (
          <div className="status">{mode === "recover" ? "Reset-Link wird geprueft..." : "Bestaetigung wird abgeschlossen..."}</div>
        ) : error && !email ? (
          <div className="error">{error}</div>
        ) : complete ? (
          <p className="login-hint">
            {mode === "recover"
              ? "Dein neues Passwort ist gespeichert. Du kannst dich jetzt wieder anmelden."
              : "Dein Admin-Zugang ist eingerichtet. Du kannst dich jetzt anmelden."}
          </p>
        ) : (
          <>
            <p className="login-hint">
              {email
                ? mode === "recover"
                  ? `Lege ein neues Passwort fuer ${email} fest.`
                  : `Lege das Passwort fuer ${email} fest.`
                : mode === "recover"
                  ? "Lege dein neues Admin-Passwort fest."
                  : "Lege dein Admin-Passwort fest."}
            </p>
            <form onSubmit={submit} className="form-grid">
              <label>
                Neues Passwort
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required />
              </label>
              <label>
                Passwort wiederholen
                <input type="password" value={passwordRepeat} onChange={(event) => setPasswordRepeat(event.target.value)} autoComplete="new-password" required />
              </label>
              {error && <div className="error">{error}</div>}
              <button type="submit" disabled={saving}>{saving ? "Speichert..." : "Passwort speichern"}</button>
            </form>
          </>
        )}
        {complete && <a className="button-link" href={loginUrl()}>Zur Anmeldung</a>}
      </section>
    </Shell>
  );
}

export function AdminApp({
  dashboard,
}: {
  dashboard: (session: AppSession) => React.ReactNode;
}) {
  const [session, setSession] = useState<AppSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [sessionMessage, setSessionMessage] = useState("");

  useEffect(() => {
    return onSessionChange((nextSession) => {
      setSession(nextSession);
      setSessionMessage(nextSession ? "" : getSessionNotice());
      setLoadingSession(false);
    }, (error) => {
      setSessionMessage(error.message);
      setLoadingSession(false);
    });
  }, []);

  if (loadingSession) {
    return <Shell><div className="status">Lade Sitzung...</div></Shell>;
  }

  return (
    <Shell>
      {sessionMessage && <div className="error" role="alert">{sessionMessage}</div>}
      {session ? dashboard(session) : <LoginForm />}
    </Shell>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="app">
      <header className="topbar">
        <div>
          <h1>Court Board-Admin</h1>
        </div>
      </header>
      {children}
    </main>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setResetMessage("");

    const { error: signInError } = await signIn(email, password);

    setBusy(false);
    if (signInError) {
      setError(signInError);
    }
  }

  async function resetPassword() {
    if (!email.trim()) {
      setError("Bitte zuerst die E-Mail-Adresse eingeben.");
      setResetMessage("");
      return;
    }

    setResetBusy(true);
    setError("");
    setResetMessage("");
    const { error: resetError } = await requestPasswordReset(email.trim());
    setResetBusy(false);
    if (resetError) {
      setError(resetError);
      return;
    }
    setResetMessage(`Wenn ${email.trim()} als Admin hinterlegt ist, wurde eine Reset-E-Mail versendet.`);
  }

  return (
    <section className="panel login-panel">
      <h2>Admin Login</h2>
      <p className="login-hint">Spiele bearbeiten, Turnierstatus pflegen und Ergebnislinks erzeugen</p>
      <form onSubmit={submit} className="form-grid">
        <label>
          E-Mail
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          Passwort
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {error && <div className="error">{error}</div>}
        {resetMessage && <div className="success">{resetMessage}</div>}
        <button type="submit" disabled={busy}>{busy ? "Anmelden..." : "Anmelden"}</button>
      </form>
      <div className="login-actions">
        <button type="button" className="secondary" onClick={() => void resetPassword()} disabled={busy || resetBusy}>
          {resetBusy ? "Sendet..." : "Passwort vergessen?"}
        </button>
      </div>
    </section>
  );
}
