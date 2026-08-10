import React, { FormEvent, useState } from "react";
import type { AdminRole, AdminUser, Tournament } from "../types";
import { formatDateTime } from "./shared";

export function AdminUsersPanel({
  admins,
  tournaments,
  currentUserEmail,
  onInvite,
  onUpdate,
  onUpdateTournaments,
  onDelete,
}: {
  admins: AdminUser[];
  tournaments: Tournament[];
  currentUserEmail: string;
  onInvite: (email: string, role: AdminRole) => Promise<boolean>;
  onUpdate: (admin: AdminUser, action: "confirm" | "resendInvite" | "updateRole" | "setSuspended", params?: { role?: AdminRole; suspended?: boolean }) => Promise<boolean>;
  onUpdateTournaments: (admin: AdminUser, tournamentIds: string[]) => Promise<boolean>;
  onDelete: (admin: AdminUser) => Promise<boolean>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("admin");
  const [saving, setSaving] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const superadminCount = admins.filter((admin) => admin.role === "superadmin").length;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const ok = await onInvite(email.trim(), role);
    if (ok) {
      setEmail("");
      setRole("admin");
    }
    setSaving(false);
  }

  async function deleteSelected(admin: AdminUser) {
    const label = admin.email || admin.user_id;
    if (!window.confirm(`Admin ${label} wirklich loeschen? Der Zugang wird aus Supabase Auth entfernt.`)) {
      return;
    }
    setDeletingUserId(admin.user_id);
    await onDelete(admin);
    setDeletingUserId("");
  }

  async function runAction(admin: AdminUser, action: "confirm" | "resendInvite" | "updateRole" | "setSuspended", params: { role?: AdminRole; suspended?: boolean } = {}) {
    const key = `${admin.user_id}:${action}`;
    setBusyAction(key);
    await onUpdate(admin, action, params);
    setBusyAction("");
  }

  async function toggleTournament(admin: AdminUser, tournamentId: string, selected: boolean) {
    const currentIds = admin.tournament_ids ?? [];
    const nextIds = selected
      ? [...new Set([...currentIds, tournamentId])]
      : currentIds.filter((id) => id !== tournamentId);
    const key = `${admin.user_id}:tournaments`;
    setBusyAction(key);
    await onUpdateTournaments(admin, nextIds);
    setBusyAction("");
  }

  return (
    <section className="admin-users-panel">
      <form className="admin-invite-form" onSubmit={submit}>
        <div>
          <h3>Admin einladen</h3>
          <p>Der neue Admin bekommt eine E-Mail und legt sein Passwort ueber den Einladungslink fest.</p>
        </div>
        <label>
          E-Mail
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          Rolle
          <select value={role} onChange={(event) => setRole(event.target.value as AdminRole)}>
            <option value="admin">Admin</option>
            <option value="superadmin">Superadmin</option>
          </select>
        </label>
        <button type="submit" disabled={saving}>{saving ? "Sendet..." : "Einladen"}</button>
      </form>
      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>E-Mail</th>
              <th>Rolle</th>
              <th>Status</th>
              <th>Turniere</th>
              <th>Angelegt</th>
              <th>Letzter Login</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((admin) => {
              const isCurrentUser = admin.email.toLowerCase() === currentUserEmail.toLowerCase();
              const isLastSuperadmin = admin.role === "superadmin" && superadminCount <= 1;
              const isSuspended = isAdminSuspended(admin);
              const deleteDisabled = deletingUserId === admin.user_id || isCurrentUser || isLastSuperadmin;
              const actionDisabled = isCurrentUser || busyAction.startsWith(`${admin.user_id}:`);
              return (
                <tr key={admin.user_id}>
                  <td>{admin.email}</td>
                  <td>
                    <select
                      className="admin-role-select"
                      value={admin.role}
                      onChange={(event) => runAction(admin, "updateRole", { role: event.target.value as AdminRole })}
                      disabled={actionDisabled || isLastSuperadmin}
                      title={isCurrentUser ? "Eigene Rolle nicht hier aendern" : isLastSuperadmin ? "Letzter Superadmin kann nicht geaendert werden" : "Rolle aendern"}
                    >
                      <option value="admin">Admin</option>
                      <option value="superadmin">Superadmin</option>
                    </select>
                  </td>
                  <td><AdminStatus admin={admin} /></td>
                  <td>
                    {admin.role === "superadmin" ? (
                      <span className="badge active">Alle</span>
                    ) : (
                      <div className="admin-tournament-list">
                        {tournaments.map((tournament) => (
                          <label key={tournament.id}>
                            <input
                              type="checkbox"
                              checked={(admin.tournament_ids ?? []).includes(tournament.id)}
                              onChange={(event) => toggleTournament(admin, tournament.id, event.target.checked)}
                              disabled={actionDisabled || busyAction === `${admin.user_id}:tournaments`}
                            />
                            {tournament.name}
                          </label>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>{formatDateTime(admin.created_at)}</td>
                  <td>{admin.last_sign_in_at ? formatDateTime(admin.last_sign_in_at) : "-"}</td>
                  <td className="admin-actions">
                    {!admin.email_confirmed_at && (
                      <button type="button" className="secondary" onClick={() => runAction(admin, "confirm")} disabled={actionDisabled}>
                        {busyAction === `${admin.user_id}:confirm` ? "Schaltet frei..." : "Freischalten"}
                      </button>
                    )}
                    {!admin.email_confirmed_at && (
                      <button type="button" className="secondary" onClick={() => runAction(admin, "resendInvite")} disabled={actionDisabled}>
                        {busyAction === `${admin.user_id}:resendInvite` ? "Sendet..." : "E-Mail erneut"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => runAction(admin, "setSuspended", { suspended: !isSuspended })}
                      disabled={actionDisabled || (isLastSuperadmin && !isSuspended)}
                      title={isCurrentUser ? "Eigenen Zugang nicht hier sperren" : isLastSuperadmin ? "Letzter Superadmin kann nicht gesperrt werden" : isSuspended ? "Admin entsperren" : "Admin sperren"}
                    >
                      {busyAction === `${admin.user_id}:setSuspended` ? "Aendert..." : isSuspended ? "Entsperren" : "Sperren"}
                    </button>
                    <button
                      type="button"
                      className="secondary danger-button"
                      onClick={() => deleteSelected(admin)}
                      disabled={deleteDisabled}
                      title={isCurrentUser ? "Eigenen Zugang nicht hier loeschen" : isLastSuperadmin ? "Letzter Superadmin kann nicht geloescht werden" : "Admin loeschen"}
                    >
                      {deletingUserId === admin.user_id ? "Loescht..." : "Loeschen"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AdminStatus({ admin }: { admin: AdminUser }) {
  const suspended = isAdminSuspended(admin);
  return (
    <div className="admin-status-list">
      {suspended && <span className="badge danger">Gesperrt</span>}
      {admin.email_confirmed_at ? <span className="badge active">Bestaetigt</span> : <span className="badge">Einladung offen</span>}
      {admin.password_setup_required ? <span className="badge">Passwort fehlt</span> : <span className="badge active">Passwort eingerichtet</span>}
      {admin.role === "superadmin" && <span className="badge">Superadmin</span>}
    </div>
  );
}

function isAdminSuspended(admin: AdminUser) {
  if (!admin.banned_until) {
    return false;
  }
  const bannedUntil = Date.parse(admin.banned_until);
  return Number.isNaN(bannedUntil) || bannedUntil > Date.now();
}
