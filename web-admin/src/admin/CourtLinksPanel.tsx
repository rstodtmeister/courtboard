import React, { useState } from "react";
import { QrCode } from "../QrCode";
import type { Game, ScoreLink } from "../types";
import { CompactLink, displayUrl, scoreUrl } from "./shared";
import { hasActiveScoreDeviceBlock, isCompleted, sortGames } from "./GamesEditor";

export function CourtLinksPanel({
  courts,
  games,
  links,
  tournamentId,
  onCreateCourtLink,
  onReplaceCourtLink,
  onUnlockCourt,
}: {
  courts: Array<{ court: string; tournamentId: string }>;
  games: Game[];
  links: ScoreLink[];
  tournamentId: string;
  onCreateCourtLink: (court: string, tournamentId: string) => Promise<void>;
  onReplaceCourtLink: (court: string, tournamentId: string, linkId: string) => Promise<void>;
  onUnlockCourt: (court: string) => Promise<void>;
}) {
  const sortedGames = sortGames(games);
  const [displayOrientation, setDisplayOrientation] = useState<"normal" | "landscape">("normal");

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
          const lockedGame = sortedGames.find((game) => game.tournament_id === entry.tournamentId && game.court === entry.court && !isCompleted(game) && (game.score_locked_by_device || hasActiveScoreDeviceBlock(game)));
          const value = link?.token ? scoreUrl(link.token) : "";
          return (
            <div className="court-link-card" key={entry.court}>
              <div className="court-link-card-head">
                <strong>Court {entry.court}</strong>
                <span className={lockedGame ? "badge" : "badge active"}>{lockedGame ? (lockedGame.score_locked_by_device ? "Geraet aktiv" : "Geraet gesperrt") : "frei"}</span>
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
              <button type="button" className="secondary" onClick={() => onUnlockCourt(entry.court)} disabled={!lockedGame}>
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
