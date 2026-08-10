import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { gameRatingOptions } from "../appConfig";
import type { PdfSheetType } from "../pdfExport";
import { draftFromGame, isPlausibleSetResult, parseScore, resultFromCompletedSetScores, scoreForSet, validateManualResult, withScoreAutomation } from "../scoreLogic";
import type { Game, GameDraft, Tournament } from "../types";
import { AppDialog } from "./shared";

export function GamesEditor({
  games,
  tournament,
  onSave,
  onReorder,
  onUnlockGame,
  onPrintPdf,
  printing,
}: {
  games: Game[];
  tournament: Tournament | null;
  onSave: (game: Game, draft: GameDraft) => Promise<boolean>;
  onReorder: (updates: Array<{ gameId: string; displayOrder: number }>) => Promise<boolean>;
  onUnlockGame: (gameId: string) => Promise<void>;
  onPrintPdf: (games: Game[], sheetType: PdfSheetType) => Promise<void>;
  printing: PdfSheetType | "";
}) {
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [selectedGameIds, setSelectedGameIds] = useState<string[]>([]);
  const [showCompletedGames, setShowCompletedGames] = useState(false);
  const [draggingGameId, setDraggingGameId] = useState<string | null>(null);
  const [dragOverGameId, setDragOverGameId] = useState<string | null>(null);
  const sortedGames = useMemo(() => sortGames(games), [games]);
  const visibleGames = showCompletedGames ? sortedGames.filter(isCompleted) : sortedGames.filter((game) => !isCompleted(game));
  const selectedGames = games.filter((game) => selectedGameIds.includes(game.id));
  const allVisibleSelected = visibleGames.length > 0 && visibleGames.every((game) => selectedGameIds.includes(game.id));
  const courtOptions = useMemo(() => numericCourtOptions(games, tournament), [games, tournament]);
  const refereeOptions = useMemo(() => assignmentOptions(games), [games]);

  function toggleGame(gameId: string, checked: boolean) {
    setSelectedGameIds((current) => checked
      ? [...new Set([...current, gameId])]
      : current.filter((id) => id !== gameId));
  }

  function toggleAll(checked: boolean) {
    const visibleIds = visibleGames.map((game) => game.id);
    setSelectedGameIds((current) => checked
      ? [...new Set([...current, ...visibleIds])]
      : current.filter((id) => !visibleIds.includes(id)));
  }

  function moveGameOrder(sourceGameId: string, targetGameId: string | null) {
    setDraggingGameId(null);
    setDragOverGameId(null);
    if (!targetGameId || sourceGameId === targetGameId) {
      return;
    }

    const sourceGame = games.find((game) => game.id === sourceGameId);
    const targetGame = games.find((game) => game.id === targetGameId);
    if (!sourceGame || !targetGame || isCompleted(sourceGame) || isCompleted(targetGame) || !isAssignedCourt(sourceGame.court) || sourceGame.court !== targetGame.court) {
      return;
    }

    const courtGames = sortGames(games).filter((game) => !isCompleted(game) && game.court === sourceGame.court);
    const sourceIndex = courtGames.findIndex((game) => game.id === sourceGameId);
    const targetIndex = courtGames.findIndex((game) => game.id === targetGameId);
    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }

    const reordered = [...courtGames];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    const updates = reordered.map((game, index) => ({ gameId: game.id, displayOrder: (index + 1) * 10 }));
    void onReorder(updates);
  }

  if (games.length === 0) {
    return <div className="empty">Noch keine Spiele vorhanden. Der naechste Schritt ist die Sync-Function fuer HVV.</div>;
  }

  return (
    <>
      <div className="pdf-toolbar">
        <div>
          <strong>{selectedGames.length}</strong> Spiele ausgewaehlt
        </div>
        <div className="actions">
          <button type="button" onClick={() => onPrintPdf(selectedGames, "normal")} disabled={selectedGames.length === 0 || Boolean(printing)}>
            {printing === "normal" ? "Erzeuge..." : "PDF DVV"}
          </button>
          <button type="button" className="secondary" onClick={() => onPrintPdf(selectedGames, "easy")} disabled={selectedGames.length === 0 || Boolean(printing)}>
            {printing === "easy" ? "Erzeuge..." : "PDF Easy"}
          </button>
        </div>
      </div>
      <label className="completed-toggle">
        <input
          type="checkbox"
          checked={showCompletedGames}
          onChange={(event) => setShowCompletedGames(event.target.checked)}
        />
        Nur abgeschlossene Spiele
      </label>
      <div className="mobile-admin-list" aria-label="Mobile Spieleverwaltung">
        {visibleGames.length === 0 ? (
          <div className="empty">{showCompletedGames ? "Keine abgeschlossenen Spiele." : "Keine offenen Spiele."}</div>
        ) : visibleGames.map((game) => (
          <MobileGameCard
            key={game.id}
            game={game}
            games={games}
            courtOptions={courtOptions}
            refereeOptions={refereeOptions}
            completedView={showCompletedGames}
            onSave={onSave}
            onEdit={setEditingGame}
            onUnlockGame={onUnlockGame}
            dragging={draggingGameId === game.id}
            dragOver={dragOverGameId === game.id && draggingGameId !== game.id}
            canDrop={Boolean(draggingGameId && isAssignedCourt(game.court) && games.find((item) => item.id === draggingGameId)?.court === game.court)}
            onDragStart={setDraggingGameId}
            onDragOver={setDragOverGameId}
            onDragEnd={moveGameOrder}
          />
        ))}
      </div>
      <div className="table-wrap game-table-wrap">
        <table className="edit-table">
          <thead>
            <tr>
              <th className="drag-cell" aria-label="Reihenfolge"></th>
              <th className="select-cell">
                <input
                  type="checkbox"
                  aria-label="Alle Spiele fuer PDF auswaehlen"
                  checked={allVisibleSelected}
                  onChange={(event) => toggleAll(event.target.checked)}
                />
              </th>
              <th>Nr.</th>
              <th>Court</th>
              <th>Teams</th>
              <th>Schiedsrichter</th>
              <th>Ergebnis</th>
              <th>Status</th>
              <th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {visibleGames.map((game) => (
              <GameEditorRow
                key={game.id}
                game={game}
                games={games}
                selected={selectedGameIds.includes(game.id)}
                courtOptions={courtOptions}
                onSelect={(checked) => toggleGame(game.id, checked)}
                onSave={onSave}
                onEdit={setEditingGame}
                onUnlockGame={onUnlockGame}
                dragging={draggingGameId === game.id}
                dragOver={dragOverGameId === game.id && draggingGameId !== game.id}
                canDrop={Boolean(draggingGameId && isAssignedCourt(game.court) && games.find((item) => item.id === draggingGameId)?.court === game.court)}
                onDragStart={setDraggingGameId}
                onDragOver={setDragOverGameId}
                onDragEnd={moveGameOrder}
              />
            ))}
          </tbody>
        </table>
      </div>
      {editingGame && (
        <GameEditDialog
          game={editingGame}
          games={games}
          courtOptions={courtOptions}
          refereeOptions={refereeOptions}
          onClose={() => setEditingGame(null)}
          onSave={async (draft) => {
            const saved = await onSave(editingGame, draft);
            if (saved) {
              setEditingGame(null);
            }
          }}
        />
      )}
    </>
  );
}

function MobileGameCard({
  game,
  games,
  courtOptions,
  refereeOptions,
  completedView,
  onSave,
  onEdit,
  onUnlockGame,
  dragging,
  dragOver,
  canDrop,
  onDragStart,
  onDragOver,
  onDragEnd,
}: {
  game: Game;
  games: Game[];
  courtOptions: string[];
  refereeOptions: string[];
  completedView: boolean;
  onSave: (game: Game, draft: GameDraft) => Promise<boolean>;
  onEdit: (game: Game) => void;
  onUnlockGame: (gameId: string) => Promise<void>;
  dragging: boolean;
  dragOver: boolean;
  canDrop: boolean;
  onDragStart: (gameId: string) => void;
  onDragOver: (gameId: string | null) => void;
  onDragEnd: (sourceGameId: string, targetGameId: string | null) => void;
}) {
  const completed = isCompleted(game);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const refereeGroups = useMemo(() => prioritizedRefereeOptions(game, games, refereeOptions), [game, games, refereeOptions]);
  const dragTargetRef = useRef<string | null>(null);

  async function updateAssignment(key: "court" | "referee", value: string) {
    if ((game[key] ?? "") === value) {
      return;
    }
    setSaveState("saving");
    const saved = await onSave(game, { ...draftFromGame(game), [key]: value });
    setSaveState(saved ? "saved" : "idle");
    if (saved) {
      window.setTimeout(() => setSaveState("idle"), 1200);
    }
  }

  if (completedView) {
    return <CompletedMobileGameCard game={game} games={games} onEdit={onEdit} />;
  }

  function handleDragStart(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragTargetRef.current = game.id;
    document.body.classList.add("mobile-game-drag-active");
    onDragStart(game.id);
    onDragOver(game.id);
  }

  function handleDragMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!dragging) {
      return;
    }
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-mobile-game-id]");
    const targetGameId = target?.dataset.mobileGameId ?? null;
    dragTargetRef.current = targetGameId;
    onDragOver(targetGameId);
  }

  function handleDragEnd(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    document.body.classList.remove("mobile-game-drag-active");
    onDragEnd(game.id, dragTargetRef.current);
    dragTargetRef.current = null;
  }

  return (
    <article className={mobileGameCardClass(game, saveState, dragging, dragOver, canDrop)} data-mobile-game-id={game.id}>
      <div className="mobile-game-assignment">
        <button
          type="button"
          className="mobile-drag-handle"
          aria-label={`Spiel ${game.number} verschieben`}
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
          disabled={saveState === "saving"}
        >
          ≡
        </button>
        <strong className="mobile-game-number">{game.number || "-"}</strong>
        <span className="mobile-assignment-label">Court</span>
        <div className="mobile-court-buttons" role="group" aria-label={`Court fuer Spiel ${game.number}`}>
          <button type="button" className={!game.court ? "active" : ""} onClick={() => updateAssignment("court", "")} disabled={saveState === "saving"}>-</button>
          {courtOptions.map((court) => (
            <button
              type="button"
              key={court}
              className={game.court === court ? "active" : ""}
              onClick={() => updateAssignment("court", court)}
              disabled={saveState === "saving"}
            >
              {court}
            </button>
          ))}
        </div>
        <select
          className="quick-select mobile-referee-select"
          value={resolvedReferee(game, games)}
          onChange={(event) => updateAssignment("referee", event.target.value)}
          aria-label={`Schiedsgericht fuer Spiel ${game.number}`}
          disabled={saveState === "saving"}
        >
          <option value="">Ohne Schiedsgericht</option>
          {refereeGroups.suggested.length > 0 && (
            <optgroup label="Vorschlaege">
              {refereeGroups.suggested.map((referee) => <option key={referee} value={referee}>{referee}</option>)}
            </optgroup>
          )}
          <optgroup label="Alle Teams">
            {refereeGroups.remaining.map((referee) => <option key={referee} value={referee}>{referee}</option>)}
          </optgroup>
        </select>
        {(completed || game.score_locked_by_device) && (
          <span className={completed ? "mobile-game-state done" : "mobile-game-state locked"}>
            {completed ? "fertig" : "läuft"}
          </span>
        )}
        <span className="mobile-save-state" aria-live="polite">{saveState === "saving" ? "Speichert..." : saveState === "saved" ? "Gespeichert" : ""}</span>
      </div>
      <div className="mobile-game-details">
        <span className="mobile-game-teams">
          <span><strong>A</strong>{game.team_a || "Team A offen"}</span>
          <span><strong>B</strong>{game.team_b || "Team B offen"}</span>
        </span>
        <button type="button" className="secondary mobile-more-button" onClick={() => onEdit(game)}>Mehr</button>
      </div>
      {(game.score_locked_by_device && !completed) && (
        <button type="button" className="secondary mobile-unlock-button" onClick={() => onUnlockGame(game.id)}>Eingabe entsperren</button>
      )}
    </article>
  );
}

function CompletedMobileGameCard({ game, games, onEdit }: { game: Game; games: Game[]; onEdit: (game: Game) => void }) {
  const result = completedResultParts(game);
  const winnerSide = completedWinnerSide(game);
  const referee = resolvedReferee(game, games);
  return (
    <article className="mobile-game-card completed result-card">
      <div className="mobile-result-head">
        <strong className="mobile-game-number">{game.number || "-"}</strong>
        <span>Court {courtLabel(game.court)}</span>
        <span>fertig</span>
      </div>
      <div className="mobile-result-team-list">
        <div className={winnerSide === "A" ? "mobile-result-team winner" : "mobile-result-team"}>
          <strong>A</strong>
          <span>{game.team_a || "Team A offen"}</span>
          <small className={setPointClass(game, 1, "A")}>{game.set1_team_a || "-"}</small>
          <small className={setPointClass(game, 2, "A")}>{game.set2_team_a || "-"}</small>
          <small className={setPointClass(game, 3, "A")}>{game.set3_team_a || "-"}</small>
          <b>{result.teamA}</b>
        </div>
        <div className={winnerSide === "B" ? "mobile-result-team winner" : "mobile-result-team"}>
          <strong>B</strong>
          <span>{game.team_b || "Team B offen"}</span>
          <small className={setPointClass(game, 1, "B")}>{game.set1_team_b || "-"}</small>
          <small className={setPointClass(game, 2, "B")}>{game.set2_team_b || "-"}</small>
          <small className={setPointClass(game, 3, "B")}>{game.set3_team_b || "-"}</small>
          <b>{result.teamB}</b>
        </div>
      </div>
      <div className="mobile-result-footer">
        <span>{referee ? `SR ${shortTeamLabel(referee, referee)}` : "SR -"}</span>
        <button type="button" className="secondary mobile-more-button" onClick={() => onEdit(game)}>Mehr</button>
      </div>
      {game.game_rating && game.game_rating !== "Normal" && <div className="mobile-result-rating">{game.game_rating}</div>}
    </article>
  );
}

function GameEditorRow({
  game,
  games,
  selected,
  courtOptions,
  onSelect,
  onSave,
  onEdit,
  onUnlockGame,
  dragging,
  dragOver,
  canDrop,
  onDragStart,
  onDragOver,
  onDragEnd,
}: {
  game: Game;
  games: Game[];
  selected: boolean;
  courtOptions: string[];
  onSelect: (checked: boolean) => void;
  onSave: (game: Game, draft: GameDraft) => Promise<boolean>;
  onEdit: (game: Game) => void;
  onUnlockGame: (gameId: string) => Promise<void>;
  dragging: boolean;
  dragOver: boolean;
  canDrop: boolean;
  onDragStart: (gameId: string) => void;
  onDragOver: (gameId: string | null) => void;
  onDragEnd: (sourceGameId: string, targetGameId: string | null) => void;
}) {
  const completed = isCompleted(game);
  const draggable = !completed && isAssignedCourt(game.court);
  async function updateAssignment(key: "court" | "referee", value: string) {
    await onSave(game, { ...draftFromGame(game), [key]: value });
  }

  function handleDragStart(event: React.DragEvent<HTMLButtonElement>) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", game.id);
    onDragStart(game.id);
  }

  function handleDragOver(event: React.DragEvent<HTMLTableRowElement>) {
    if (!draggable) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = canDrop ? "move" : "none";
    onDragOver(game.id);
  }

  function handleDrop(event: React.DragEvent<HTMLTableRowElement>) {
    event.preventDefault();
    onDragEnd(event.dataTransfer.getData("text/plain"), game.id);
  }

  function handleDragEnd() {
    onDragEnd(game.id, null);
  }

  return (
    <tr
      className={gameRowClass(game, dragging, dragOver, canDrop)}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <td className="drag-cell">
        <button
          type="button"
          className="desktop-drag-handle"
          aria-label={`Spiel ${game.number} verschieben`}
          draggable={draggable}
          disabled={!draggable}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          ≡
        </button>
      </td>
      <td className="select-cell">
        <input
          type="checkbox"
          aria-label={`Spiel ${game.number || ""} fuer PDF auswaehlen`}
          checked={selected}
          onChange={(event) => onSelect(event.target.checked)}
        />
      </td>
      <td className="number-cell">
        <strong>{game.number}</strong>
      </td>
      <td>
        <select className="quick-select court-select" value={game.court ?? ""} onChange={(event) => updateAssignment("court", event.target.value)} aria-label={`Court fuer Spiel ${game.number}`}>
          <option value="">-</option>
          {courtOptions.map((court) => <option key={court} value={court}>Court {court}</option>)}
        </select>
      </td>
      <td>
        <div className="team-summary">{game.team_a || "Team A offen"}</div>
        <div className="team-summary">{game.team_b || "Team B offen"}</div>
      </td>
      <td>
        {resolvedReferee(game, games) || <span className="muted-text">-</span>}
      </td>
      <td>
        <div>{formatResultWithSets(game) || "-"}</div>
        {completed && game.winner_team && <div className="muted-text">Sieger: {game.winner_team}</div>}
        {game.game_rating && game.game_rating !== "Normal" && <div className="muted-text">{game.game_rating}</div>}
        {game.score_locked_by_device && !completed && <div className="muted-text">Eingabe auf einem Geraet aktiv</div>}
      </td>
      <td>
        {game.dirty ? <span className="badge">geaendert</span> : <span className="muted-text">-</span>}
      </td>
      <td className="row-actions">
        <button type="button" onClick={() => onEdit(game)}>Bearbeiten</button>
        {game.score_locked_by_device && !completed && (
          <button type="button" className="secondary" onClick={() => onUnlockGame(game.id)}>Eingabe entsperren</button>
        )}
      </td>
    </tr>
  );
}

function GameEditDialog({
  game,
  games,
  courtOptions,
  refereeOptions,
  onClose,
  onSave,
}: {
  game: Game;
  games: Game[];
  courtOptions: string[];
  refereeOptions: string[];
  onClose: () => void;
  onSave: (draft: GameDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<GameDraft>(() => draftFromGame(game));
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"reset" | null>(null);
  const [correctionEditing, setCorrectionEditing] = useState(false);
  const completedOnOpen = isCompleted(game);
  const scoreFieldsLocked = completedOnOpen && !correctionEditing;
  const correctionActive = completedOnOpen && correctionEditing;
  const hasSetScores = hasAnySetScore(draft);
  const setValidation = validateManualResult(draft);
  const setScoresNeedValidation = hasSetScores && !scoreFieldsLocked && !isSpecialRating(draft.game_rating);
  const canSave = !saving && (!setScoresNeedValidation || setValidation.valid);
  const saveLabel = saving
    ? "Speichert..."
    : correctionActive
      ? "Korrektur speichern"
      : setScoresNeedValidation
        ? setValidation.valid ? "Ergebnis speichern" : "Ergebnis unvollständig"
        : "Speichern";

  function update<K extends keyof GameDraft>(key: K, value: GameDraft[K]) {
    setDraft((current) => withScoreAutomation({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) {
      return;
    }
    const nextDraft = withScoreAutomation(draft);
    const completed = nextDraft.completed || isSpecialRating(nextDraft.game_rating) || (hasAnySetScore(nextDraft) && validateManualResult(nextDraft).valid);
    setSaving(true);
    await onSave({ ...nextDraft, completed, game_rating: nextDraft.game_rating || "Normal" });
    setSaving(false);
  }

  async function resetCompleted() {
    setConfirmAction(null);
    setSaving(true);
    await onSave({
      ...draft,
      result: "",
      winner_team: "",
      game_rating: "Normal",
      set1_team_a: "",
      set1_team_b: "",
      set2_team_a: "",
      set2_team_b: "",
      set3_team_a: "",
      set3_team_b: "",
      completed: false,
      point_history: null,
    });
    setSaving(false);
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="game-edit-dialog" onSubmit={submit}>
        <div className="dialog-heading">
          <h3>Spiel bearbeiten</h3>
          <button type="button" className="secondary" onClick={onClose}>Schließen</button>
        </div>

        <div className="dialog-field">
          <div className="dialog-label">Spiel</div>
          <div className="game-teams-panel">
            <div><strong>Team A</strong><span>{game.team_a || "Team A offen"}</span></div>
            <div><strong>Team B</strong><span>{game.team_b || "Team B offen"}</span></div>
            {game.referee && <div><strong>Schiedsrichter</strong><span>{resolvedReferee(game, games)}</span></div>}
          </div>
        </div>

        <label className="dialog-field">
          <span className="dialog-label">Court</span>
          <select value={draft.court ?? ""} onChange={(event) => update("court", event.target.value)}>
            <option value="">Nicht zugewiesen</option>
            {courtOptions.map((court) => <option key={court} value={court}>Court {court}</option>)}
          </select>
        </label>

        <label className="dialog-field">
          <span className="dialog-label">Schiedsgericht</span>
          <select value={draft.referee ?? ""} onChange={(event) => update("referee", event.target.value)}>
            <option value="">Nicht zugewiesen</option>
            {refereeOptions.map((referee) => <option key={referee} value={referee}>{referee}</option>)}
          </select>
        </label>

        <label className="dialog-field">
          <span className="dialog-label">Spielwertung</span>
          <select value={draft.game_rating ?? ""} onChange={(event) => update("game_rating", event.target.value)} disabled={scoreFieldsLocked}>
            {gameRatingOptions.map((option) => (
              <option key={option || "empty"} value={option}>{option || "Wertung"}</option>
            ))}
          </select>
        </label>

        <div className={scoreFieldsLocked ? "dialog-field correction-field locked" : "dialog-field correction-field"}>
          <div className="dialog-label">Satzpunkte</div>
          <div className="score-correction-box">
            {completedOnOpen && (
              <div className="admin-correction-header">
                <div>
                  <strong>{correctionEditing ? "Admin-Korrektur" : "Vom Schiedsgericht erfasst"}</strong>
                  <span>{correctionEditing ? "Satzwerte können jetzt bewusst angepasst werden." : "Satzwerte sind geschützt. Zum Ändern zuerst Korrektur starten."}</span>
                </div>
                {!correctionEditing && (
                  <button type="button" className="secondary" onClick={() => setCorrectionEditing(true)} disabled={saving}>
                    Korrektur bearbeiten
                  </button>
                )}
              </div>
            )}
            <div className="score-edit-grid">
              <div></div>
              <strong>Team A</strong>
              <strong>Team B</strong>
              <span>1. Satz</span>
              <ScoreInput value={draft.set1_team_a} onChange={(value) => update("set1_team_a", value)} label="Satz 1 Team A" disabled={scoreFieldsLocked} />
              <ScoreInput value={draft.set1_team_b} onChange={(value) => update("set1_team_b", value)} label="Satz 1 Team B" disabled={scoreFieldsLocked} />
              <span>2. Satz</span>
              <ScoreInput value={draft.set2_team_a} onChange={(value) => update("set2_team_a", value)} label="Satz 2 Team A" disabled={scoreFieldsLocked} />
              <ScoreInput value={draft.set2_team_b} onChange={(value) => update("set2_team_b", value)} label="Satz 2 Team B" disabled={scoreFieldsLocked} />
              <span>3. Satz</span>
              <ScoreInput value={draft.set3_team_a} onChange={(value) => update("set3_team_a", value)} label="Satz 3 Team A" disabled={scoreFieldsLocked} />
              <ScoreInput value={draft.set3_team_b} onChange={(value) => update("set3_team_b", value)} label="Satz 3 Team B" disabled={scoreFieldsLocked} />
            </div>
            {!scoreFieldsLocked && setScoresNeedValidation && !setValidation.valid && (
              <div className="manual-result-validation admin-result-validation" aria-live="polite">
                {setValidation.errors.length > 0
                  ? setValidation.errors.map((error) => <span key={error} className="error-text">{error}</span>)
                  : <span className="error-text">Satzergebnis ist noch unvollständig.</span>}
              </div>
            )}
          </div>
        </div>

        <div className="dialog-field">
          <div className="dialog-label">Automatik</div>
          <div className="result-preview">
            <span>Ergebnis: <strong>{draft.result || "-"}</strong></span>
            <span>Sieger: <strong>{draft.winner_team || "-"}</strong></span>
            <span>Status: <strong>{isCompletedDraft(draft) ? "abgeschlossen" : "offen"}</strong></span>
          </div>
        </div>

        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>Abbrechen</button>
          {isCompletedDraft(draft) && <button type="button" className="secondary" onClick={() => setConfirmAction("reset")} disabled={saving}>Abschluss zurücksetzen</button>}
          <button type="submit" disabled={!canSave}>{saveLabel}</button>
        </div>
      </form>
      {confirmAction === "reset" && (
        <AppDialog
          title="Abschluss zurücksetzen?"
          message="Das Spiel erscheint danach wieder als offen."
          secondaryLabel="Abbrechen"
          primaryLabel="Zurücksetzen"
          onSecondary={() => setConfirmAction(null)}
          onPrimary={resetCompleted}
          onClose={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}

function ScoreInput({ value, label, disabled = false, onChange }: { value: string | null; label: string; disabled?: boolean; onChange: (value: string) => void }) {
  return <input inputMode="numeric" value={value ?? ""} onChange={(event) => onChange(event.target.value)} aria-label={label} disabled={disabled} />;
}

export function sortGames(games: Game[]) {
  const sorted = [...games].sort(compareGameNumbers);
  const indexesByCourt = new Map<string, number[]>();
  const gamesByCourt = new Map<string, Game[]>();

  sorted.forEach((game, index) => {
    const court = (game.court ?? "").trim();
    if (!court || isCompleted(game)) {
      return;
    }
    indexesByCourt.set(court, [...(indexesByCourt.get(court) ?? []), index]);
    gamesByCourt.set(court, [...(gamesByCourt.get(court) ?? []), game]);
  });

  for (const [court, courtGames] of gamesByCourt) {
    const orderedCourtGames = [...courtGames].sort((left, right) =>
      gameOrderSortKey(left) - gameOrderSortKey(right) || compareGameNumbers(left, right)
    );
    indexesByCourt.get(court)?.forEach((index, orderIndex) => {
      sorted[index] = orderedCourtGames[orderIndex];
    });
  }

  return sorted;
}

function gameOrderSortKey(game: Game) {
  return game.display_order ?? gameNumberSortKey(game.number);
}

function compareGameNumbers(left: Game, right: Game) {
  return gameNumberSortKey(left.number) - gameNumberSortKey(right.number) || left.number.localeCompare(right.number, "de", { numeric: true });
}

function numericCourtOptions(games: Game[], tournament: Tournament | null = null): string[] {
  const configuredCourts = tournament?.courts
    .map((court) => court.trim())
    .filter((court) => courtNumber(court) > 0) ?? [];
  const gameCourts = games
    .map((game) => courtLabel(game.court))
    .filter((court): court is string => court !== "-");
  const courts = [...new Set([...configuredCourts, ...gameCourts])];
  const sorted = courts.sort((left, right) => Number.parseInt(left, 10) - Number.parseInt(right, 10));
  return sorted.length > 0 ? sorted : ["1", "2", "3", "4"];
}

function assignmentOptions(games: Game[]): string[] {
  const values = games.flatMap((game) => [game.team_a, game.team_b, game.referee])
    .map((value) => (value ?? "").trim())
    .filter((value): value is string => Boolean(value) && value !== "(Freilos)" && !isLegacyPreviousGameReferee(value));
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "de", { numeric: true }));
}

function prioritizedRefereeOptions(game: Game, games: Game[], allOptions: string[]) {
  const current = resolvedReferee(game, games);
  const currentNumber = gameNumberSortKey(game.number);
  const sameCourtNeighbours = games
    .filter((candidate) => candidate.id !== game.id && candidate.court === game.court)
    .sort((left, right) => Math.abs(gameNumberSortKey(left.number) - currentNumber) - Math.abs(gameNumberSortKey(right.number) - currentNumber))
    .slice(0, 2);
  const suggestedValues = [current, game.referee, ...sameCourtNeighbours.flatMap((candidate) => [candidate.team_a, candidate.team_b, candidate.referee])];
  const suggested = uniqueAssignmentValues(suggestedValues)
    .filter((value) => allOptions.includes(value) && value !== game.team_a && value !== game.team_b)
    .slice(0, 5);
  const remaining = allOptions.filter((value) => !suggested.includes(value));
  return { suggested, remaining };
}

function uniqueAssignmentValues(values: Array<string | null | undefined>) {
  return [...new Set(values
    .map((value) => (value ?? "").trim())
    .filter((value): value is string => Boolean(value) && value !== "(Freilos)" && !isLegacyPreviousGameReferee(value)))];
}

function gameRowClass(game: Game, dragging = false, dragOver = false, canDrop = false) {
  return [
    game.dirty ? "dirty-row" : "",
    dragging ? "dragging-row" : "",
    dragOver ? "drag-over-row" : "",
    dragOver && canDrop ? "drop-allowed-row" : "",
  ].filter(Boolean).join(" ");
}

function mobileGameCardClass(game: Game, saveState: "idle" | "saving" | "saved", dragging = false, dragOver = false, canDrop = false) {
  return [
    "mobile-game-card",
    `court-${courtLabel(game.court).toLowerCase()}`,
    isCompleted(game) ? "completed" : "",
    game.score_locked_by_device && !isCompleted(game) ? "locked" : "",
    game.dirty ? "dirty-row" : "",
    saveState === "saving" ? "saving" : "",
    saveState === "saved" ? "saved" : "",
    dragging ? "dragging" : "",
    dragOver ? "drag-over" : "",
    dragOver && canDrop ? "drop-allowed" : "",
  ].filter(Boolean).join(" ").replace("court--", "court-none");
}

export function resolvedReferee(game: Game, _games: Game[]) {
  const referee = game.referee ?? "";
  return isLegacyPreviousGameReferee(referee) ? "" : referee;
}

function isLegacyPreviousGameReferee(value: string) {
  return value === "__previous_winner__" || value === "__previous_loser__";
}

function gameNumberSortKey(number: string | null) {
  const match = (number ?? "").match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : Number.MAX_SAFE_INTEGER;
}

function courtNumber(court: string | null) {
  const normalized = (court ?? "").trim();
  return /^\d+$/.test(normalized) ? Number.parseInt(normalized, 10) : -1;
}

export function isAssignedCourt(court: string | null | undefined) {
  return courtNumber(court ?? null) > 0;
}

export function courtLabel(court: string | null | undefined) {
  return isAssignedCourt(court) ? (court ?? "").trim() : "-";
}

export function isCompleted(game: Game) {
  return Boolean(game.completed || isSpecialRating(game.game_rating));
}

export function hasActiveScoreDeviceBlock(game: Game) {
  if (!game.score_blocked_device || !game.score_blocked_until) {
    return false;
  }
  const blockedUntil = Date.parse(game.score_blocked_until);
  return Number.isFinite(blockedUntil) && blockedUntil > Date.now();
}

function isCompletedDraft(draft: GameDraft) {
  return Boolean(draft.completed || isSpecialRating(draft.game_rating));
}

function hasAnySetScore(draft: GameDraft) {
  return Boolean(
    draft.set1_team_a || draft.set1_team_b
    || draft.set2_team_a || draft.set2_team_b
    || draft.set3_team_a || draft.set3_team_b,
  );
}

function isSpecialRating(rating: string | null) {
  const normalized = (rating ?? "").trim();
  return Boolean(normalized && normalized !== "Normal");
}

export function formatResultWithSets(game: Game) {
  const result = resultFromCompletedSetScores(game) || game.result?.trim() || "";
  const setScores = formatSetScores(game);
  if (result && setScores) {
    return `${result} (${setScores})`;
  }
  if (result) {
    return result;
  }
  if (setScores) {
    return `(${setScores})`;
  }
  return "";
}

function formatSetScores(game: Game) {
  return [
    [game.set1_team_a, game.set1_team_b],
    [game.set2_team_a, game.set2_team_b],
    [game.set3_team_a, game.set3_team_b],
  ]
    .filter(([teamA, teamB]) => teamA || teamB)
    .map(([teamA, teamB]) => `${teamA ?? ""}:${teamB ?? ""}`)
    .join(",");
}

function completedWinnerSide(game: Game): "A" | "B" | "" {
  if (game.winner_team === game.team_a || game.winner_team === "1") {
    return "A";
  }
  if (game.winner_team === game.team_b || game.winner_team === "2") {
    return "B";
  }
  const index = winnerIndexFromScores(game);
  return index === 1 ? "A" : index === 2 ? "B" : "";
}

function completedResultParts(game: Game) {
  const result = resultFromCompletedSetScores(game) || game.result?.trim() || "";
  const match = result.match(/(\d+)\s*[:-]\s*(\d+)/);
  return {
    teamA: match?.[1] ?? "-",
    teamB: match?.[2] ?? "-",
  };
}

function setPointClass(game: Game, setNumber: 1 | 2 | 3, team: "A" | "B") {
  const score = scoreForSet(draftFromGame(game), setNumber);
  if (score.A === score.B) {
    return "";
  }
  return score[team] > score[team === "A" ? "B" : "A"] ? "set-winner" : "";
}

function winnerIndexFromScores(game: Game) {
  const computed = resultFromCompletedSetScores(game);
  const source = computed || game.result || "";
  const match = source.match(/(\d+)\s*[:-]\s*(\d+)/);
  if (!match) {
    return 0;
  }
  const teamA = Number.parseInt(match[1], 10);
  const teamB = Number.parseInt(match[2], 10);
  if (teamA > teamB) {
    return 1;
  }
  if (teamB > teamA) {
    return 2;
  }
  return 0;
}

function shortTeamLabel(value: string | null | undefined, fallback: string) {
  const label = value?.replace(/\s*\(\d+\)\s*$/, "").trim() || fallback;
  return label.replace(/\s+-\s+/g, " / ");
}
