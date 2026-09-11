import React, { useEffect, useState } from "react";
import { QrCode } from "../QrCode";
import type { CourtLock, Game, ScoreLink } from "../types";
import { CompactLink, displayUrl, scoreUrl } from "./shared";
import { isCompleted, sortGames } from "./GamesEditor";

export function CourtLinksPanel({
  courts,
  games,
  links,
  courtLocks,
  tournamentId,
  onCreateCourtLink,
  onReplaceCourtLink,
  onUnlockCourt,
  courtStreams,
  onSaveCourtStream,
}: {
  courts: Array<{ court: string; tournamentId: string }>;
  games: Game[];
  links: ScoreLink[];
  courtLocks: CourtLock[];
  tournamentId: string;
  onCreateCourtLink: (court: string, tournamentId: string) => Promise<void>;
  onReplaceCourtLink: (court: string, tournamentId: string, linkId: string) => Promise<void>;
  onUnlockCourt: (court: string) => Promise<void>;
  courtStreams: Record<string, string>;
  onSaveCourtStream: (court: string, value: string) => Promise<void>;
}) {
  const [printingQr, setPrintingQr] = useState(false);
  const [qrError, setQrError] = useState("");
  async function printCourtQrCodes() {
    setPrintingQr(true);
    setQrError("");
    try {
      const entries = courts.map(entry => {
        const url = new URL(displayUrl(entry.tournamentId, displayOrientation));
        url.searchParams.set("court", entry.court);
        return { court: entry.court, url: url.toString() };
      });
      const { downloadCourtQrPdf } = await import("../courtQrPdf");
      await downloadCourtQrPdf(entries, "QR Codes Courts · Öffentliche Anzeigen");
    } catch (error) {
      setQrError(error instanceof Error ? error.message : "PDF konnte nicht erstellt werden.");
    } finally { setPrintingQr(false); }
  }
  const sortedGames = sortGames(games);
  const [openSections, setOpenSections] = useState<Record<string, string>>({});
  const [displayOrientation, setDisplayOrientation] = useState<"normal" | "landscape">("normal");
  const [streamDrafts, setStreamDrafts] = useState<Record<string, string>>(courtStreams);
  const [savingStreamCourt, setSavingStreamCourt] = useState("");

  useEffect(() => setStreamDrafts(courtStreams), [courtStreams]);

  async function saveStream(court: string) {
    setSavingStreamCourt(court);
    try {
      await onSaveCourtStream(court, streamDrafts[court] ?? "");
    } finally {
      setSavingStreamCourt("");
    }
  }

  return (
    <section className="court-link-panel">
      <div className="subsection-heading">
        <div>
          <h3>Courts</h3>
          <p className="court-panel-help">Ein fester QR-Code pro Court. Das erste Geraet sperrt die Eingabe fuer das aktuelle Spiel.</p>
        </div>
        <div className="court-display-link-controls">
          <select value={displayOrientation} onChange={(event) => setDisplayOrientation(event.target.value as "normal" | "landscape")} aria-label="Ausrichtung fuer Courts-Anzeige">
            <option value="normal">Standard</option>
            <option value="landscape">Querformat</option>
          </select>
          <div className="court-display-download-actions">
            <a className="secondary-link" href={displayUrl(tournamentId, displayOrientation)} target="_blank" rel="noreferrer">Courts anzeigen</a>
            <button type="button" className="secondary" onClick={() => void printCourtQrCodes()} disabled={printingQr || !courts.length}>{printingQr ? "PDF wird erstellt…" : "QR Codes Courts pdf"}</button>
          </div>
        </div>
      </div>
      {qrError && <div className="error" role="alert">{qrError}</div>}
      <div className="court-link-grid">
        {courts.map((entry) => {
          const link = links.find((item) => item.court === entry.court);
          const currentGame = sortedGames.find((game) => game.tournament_id === entry.tournamentId && game.court === entry.court && !isCompleted(game));
          const courtLock = courtLocks.find((lock) => lock.tournament_id === entry.tournamentId && lock.court === entry.court);
          const activeLock = Boolean(courtLock?.active_device_id && courtLock.locked_at && Date.parse(courtLock.locked_at) >= Date.now() - 30 * 60 * 1000);
          const blockedLock = Boolean(courtLock?.blocked_device_id && courtLock.blocked_until && Date.parse(courtLock.blocked_until) > Date.now());
          const overlayUrl = new URL(displayUrl(entry.tournamentId));
          overlayUrl.searchParams.set("view", "overlay");
          overlayUrl.searchParams.set("court", entry.court);
          const value = link?.token ? scoreUrl(link.token) : "";
          const sectionKey = `${entry.tournamentId}:${entry.court}`;
          const sectionProps = (section: string) => ({
            open: openSections[sectionKey] === section,
            onToggle: () => setOpenSections((current) => ({
              ...current,
              [sectionKey]: current[sectionKey] === section ? "" : section,
            })),
          });
          return (
            <div className="court-link-card" key={entry.court}>
              <div className="court-link-card-head">
                <strong>Court {entry.court}</strong>
                <span className={activeLock || blockedLock ? "badge" : "badge active"}>{activeLock ? "Geraet aktiv" : blockedLock ? "Geraet gesperrt" : "frei"}</span>
              </div>
              <div className="court-link-current">
                {currentGame ? (
                  <>
                    <span>Aktuelles Spiel</span>
                    <strong>Nr. {currentGame.number}: {currentGame.team_a} vs. {currentGame.team_b}</strong>
                  </>
                ) : (
                  <span>Kein offenes Spiel</span>
                )}
              </div>
              <CourtSection title="Livestream" status={courtStreams[entry.court] ? "eingerichtet" : "kein Stream"} {...sectionProps("stream")}>
                <div className="court-stream-control">
                  <label htmlFor={`court-stream-${entry.court}`}>YouTube- oder Twitch-Livestream</label>
                  <input
                    id={`court-stream-${entry.court}`}
                    type="url"
                    inputMode="url"
                    placeholder="YouTube- oder Twitch-Link"
                    value={streamDrafts[entry.court] ?? ""}
                    onChange={(event) => setStreamDrafts((current) => ({ ...current, [entry.court]: event.target.value }))}
                  />
                  <button type="button" className="secondary" onClick={() => saveStream(entry.court)} disabled={savingStreamCourt === entry.court}>
                    {savingStreamCourt === entry.court ? "Speichert…" : streamDrafts[entry.court] ? "Stream speichern" : "Stream entfernen"}
                  </button>
                </div>
              </CourtSection>
              <CourtSection title="Spielstand für Streaming" {...sectionProps("overlay")}>
                <div className="court-stream-control">
                  <span className="court-panel-help">Als Web-Quelle einbinden. Transparenter Hintergrund, automatische Aktualisierung.</span>
                  <CompactLink value={overlayUrl.toString()} hideQr mobileCompact />
                  <a className="secondary-link" href={overlayUrl.toString()} target="_blank" rel="noreferrer">Vorschau</a>
                </div>
              </CourtSection>
              <CourtSection title="Schiedsrichter" {...sectionProps("referee")}>
                {value ? (
                  <div className="court-link-qr">
                    <QrCode value={value} compact />
                    <CompactLink value={value} hideQr mobileCompact />
                  </div>
                ) : link ? (
                  <button type="button" onClick={() => onReplaceCourtLink(entry.court, entry.tournamentId, link.id)}>
                    QR-Code neu erzeugen
                  </button>
                ) : (
                  <button type="button" onClick={() => onCreateCourtLink(entry.court, entry.tournamentId)}>
                    QR-Code erzeugen
                  </button>
                )}
                <details className="court-more-actions">
                  <summary>Weitere Aktionen</summary>
                <button type="button" className="secondary" onClick={() => onUnlockCourt(entry.court)}>
                  Court entsperren
                </button>
                {link && value && (
                  <button type="button" className="secondary" onClick={() => onReplaceCourtLink(entry.court, entry.tournamentId, link.id)}>
                    QR-Code ersetzen
                  </button>
                )}
                </details>
              </CourtSection>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CourtSection({ title, status, open, onToggle, children }: {
  title: string;
  status?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <section className={`court-section${open ? " is-open" : ""}`}>
      <button type="button" className="court-section-toggle" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <span className="court-section-arrow" aria-hidden="true">{open ? "▾" : "▸"}</span>
        <span>{title}</span>
        {status && <small>{status}</small>}
      </button>
      <h4 className="court-section-desktop-title">{title}</h4>
      <div id={id} className="court-section-content">{children}</div>
    </section>
  );
}
