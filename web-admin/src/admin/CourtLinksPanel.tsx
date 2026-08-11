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
  const sortedGames = sortGames(games);
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
          <h3>Court-QR-Codes</h3>
          <p>Ein fester QR-Code pro Court. Das erste Geraet sperrt die Eingabe fuer das aktuelle Spiel.</p>
        </div>
        <div className="court-display-link-controls">
          <select value={displayOrientation} onChange={(event) => setDisplayOrientation(event.target.value as "normal" | "landscape")} aria-label="Ausrichtung fuer Courts-Anzeige">
            <option value="normal">Standard</option>
            <option value="landscape">Querformat</option>
          </select>
          <a className="secondary-link" href={displayUrl(tournamentId, displayOrientation)} target="_blank" rel="noreferrer">Courts anzeigen</a>
        </div>
      </div>
      <div className="court-link-grid">
        {courts.map((entry) => {
          const link = links.find((item) => item.court === entry.court);
          const currentGame = sortedGames.find((game) => game.tournament_id === entry.tournamentId && game.court === entry.court && !isCompleted(game));
          const courtLock = courtLocks.find((lock) => lock.tournament_id === entry.tournamentId && lock.court === entry.court);
          const activeLock = Boolean(courtLock?.active_device_id && courtLock.locked_at && Date.parse(courtLock.locked_at) >= Date.now() - 30 * 60 * 1000);
          const blockedLock = Boolean(courtLock?.blocked_device_id && courtLock.blocked_until && Date.parse(courtLock.blocked_until) > Date.now());
          const value = link?.token ? scoreUrl(link.token) : "";
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
              <div className="court-stream-control">
                <label htmlFor={`court-stream-${entry.court}`}>YouTube-Livestream</label>
                <input
                  id={`court-stream-${entry.court}`}
                  type="url"
                  inputMode="url"
                  placeholder="https://www.youtube.com/watch?v=…"
                  value={streamDrafts[entry.court] ?? ""}
                  onChange={(event) => setStreamDrafts((current) => ({ ...current, [entry.court]: event.target.value }))}
                />
                <button type="button" className="secondary" onClick={() => saveStream(entry.court)} disabled={savingStreamCourt === entry.court}>
                  {savingStreamCourt === entry.court ? "Speichert…" : streamDrafts[entry.court] ? "Stream speichern" : "Stream entfernen"}
                </button>
              </div>
              {value ? (
                <div className="court-link-qr">
                  <QrCode value={value} compact />
                  <CompactLink value={value} hideQr />
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
              <button type="button" className="secondary" onClick={() => onUnlockCourt(entry.court)}>
                Court entsperren
              </button>
              {link && value && (
                <button type="button" className="secondary" onClick={() => onReplaceCourtLink(entry.court, entry.tournamentId, link.id)}>
                  QR-Code ersetzen
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
