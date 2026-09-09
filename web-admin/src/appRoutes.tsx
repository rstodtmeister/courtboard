import React, { Suspense, lazy } from "react";

const CourtDisplayApp = lazy(async () => {
  const module = await import("./CourtDisplayApp");
  return { default: module.CourtDisplayApp };
});

const ScoreEntryApp = lazy(async () => {
  const module = await import("./ScoreEntryApp");
  return { default: module.ScoreEntryApp };
});

const AdminApp = lazy(async () => {
  const module = await import("./admin/auth");
  return { default: module.AdminApp };
});

const AuthCredentialApp = lazy(async () => {
  const module = await import("./admin/auth");
  return { default: module.AuthCredentialApp };
});

const AdminDashboard = lazy(async () => {
  const module = await import("./admin/AdminDashboard");
  return { default: module.AdminDashboard };
});

type AppRoute =
  | { kind: "auth"; mode: "invite" | "recover" }
  | { kind: "score"; token: string }
  | { kind: "courts"; court: string; tournamentId: string; orientation: "landscape" | "normal" }
  | { kind: "groups"; tournamentId: string; orientation: "landscape" | "normal" }
  | { kind: "overlay"; court: string; tournamentId: string }
  | { kind: "admin" };

function readRoute(): AppRoute {
  const params = new URLSearchParams(window.location.search);
  const auth = params.get("auth") ?? "";
  const token = params.get("token") ?? "";
  const view = params.get("view") ?? "";
  const court = params.get("court") ?? "";
  const tournamentId = params.get("tournamentId") ?? "";
  const orientation = params.get("orientation") === "landscape" ? "landscape" : "normal";

  if (auth === "confirmed" || auth === "recover") {
    return { kind: "auth", mode: auth === "recover" ? "recover" : "invite" };
  }

  if (token) {
    return { kind: "score", token };
  }

  if (view === "overlay") {
    return { kind: "overlay", court, tournamentId };
  }

  if (view === "courts") {
    return { kind: "courts", court, tournamentId, orientation };
  }

  if (view === "groups") {
    return { kind: "groups", tournamentId, orientation };
  }

  return { kind: "admin" };
}

export function AppRouter() {
  const route = readRoute();

  return (
    <Suspense fallback={route.kind === "overlay" ? null : <div className="status">Ansicht wird geladen...</div>}>
      {route.kind === "overlay" && <CourtDisplayApp court={route.court} tournamentId={route.tournamentId} overlay />}
      {route.kind === "auth" && <AuthCredentialApp mode={route.mode} />}
      {route.kind === "score" && <ScoreEntryApp token={route.token} />}
      {route.kind === "courts" && <CourtDisplayApp court={route.court} tournamentId={route.tournamentId} orientation={route.orientation} />}
      {route.kind === "groups" && <CourtDisplayApp court="" tournamentId={route.tournamentId} mode="groups" orientation={route.orientation} />}
      {route.kind === "admin" && <AdminApp dashboard={(session) => <AdminDashboard session={session} />} />}
    </Suspense>
  );
}
