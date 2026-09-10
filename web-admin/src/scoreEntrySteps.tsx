import React, { useEffect, useRef, useState } from "react";
import { gameRatingOptions, noRefereeSelection, specialGameRatingOptions } from "./appConfig";
import { completedSetRows, hasTwoSetLeadAfterSecondSet, isPlausibleSetResult, secondServer, serviceOrder, setScoreForSide } from "./scoreLogic";
import { completedResultParts, completedWinnerSide, playersForTeam, setPointClass, shortTeamLabel, sortRefereeOptions, teamOptions } from "./scoreEntryHelpers";
import type { Game, GameDraft } from "./types";
import type { LiveSnapshot, ScoreEntryResumeState, ServerSetupStep, TeamKey } from "./workflowTypes";

type UpdateDraftField = <K extends keyof GameDraft>(key: K, value: GameDraft[K]) => void;

export function LockedScoreEntry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="score-step-card locked-entry-card">
      <h2>Dieses Spiel ist bereits geoeffnet</h2>
      <p>{message}</p>
      <p>Falls das falsche Geraet verbunden ist, kann der Admin die Eingabe fuer den Court entsperren.</p>
      <button type="button" onClick={onRetry}>Erneut pruefen</button>
    </div>
  );
}

export function ScoreContextBox({ game, draft, showReferee }: { game: Game; draft: GameDraft; showReferee: boolean }) {
  return (
    <section className="score-context-box" aria-label="Spielinformationen">
      <div>
        <span>Spiel</span>
        <strong>{game.number || "-"}</strong>
      </div>
      <div>
        <span>Court</span>
        <strong>{game.court || "-"}</strong>
      </div>
      <div className="score-context-match">
        <span>Begegnung</span>
        <strong>
          <b>{shortTeamLabel(game.team_a, "Team A")}</b>
          <em>gegen</em>
          <b>{shortTeamLabel(game.team_b, "Team B")}</b>
        </strong>
      </div>
      {showReferee && draft.referee && (
        <div className="score-context-referee">
          <span>Schiedsgericht</span>
          <strong>{draft.referee}</strong>
        </div>
      )}
    </section>
  );
}

export function RefereeSelectStep({
  game,
  games,
  allTeams,
  draft,
  saving,
  canResume,
  onConfirm,
  onResume,
}: {
  game: Game;
  games: Game[];
  allTeams: string[];
  draft: GameDraft;
  saving: boolean;
  canResume: boolean;
  onConfirm: (referee: string) => void;
  onResume: () => void;
}) {
  const [selectedReferee, setSelectedReferee] = useState(draft.referee || game.referee || "");
  const options = (allTeams.length > 0 ? allTeams : teamOptions(games))
    .filter((team) => team !== game.team_a && team !== game.team_b);
  const selectableOptions = sortRefereeOptions([
    ...(selectedReferee && selectedReferee !== noRefereeSelection ? [selectedReferee] : []),
    ...options,
  ]);
  const refereeValue = selectedReferee === noRefereeSelection ? "" : selectedReferee;
  const resultOnly = selectedReferee === noRefereeSelection;

  return (
    <section className="score-step-card score-intro-card referee-intro-card">
      <h2 className="question-title">Wer pfeift?</h2>
      <label className="referee-self-select compact">
        <span className="sr-only">Schiedsgericht</span>
        <select value={selectedReferee} onChange={(event) => setSelectedReferee(event.target.value)}>
          <option value="">Team auswaehlen</option>
          <option value={noRefereeSelection}>Ohne Schiedsgericht</option>
          {selectableOptions.map((team) => (
            <option key={team} value={team}>{shortTeamLabel(team, team)}</option>
          ))}
        </select>
      </label>
      <div className="preview-start-actions">
        <button type="button" onClick={() => onConfirm(refereeValue)} disabled={!selectedReferee || saving}>
          {saving ? "Speichert..." : resultOnly ? "Ergebnis eintragen" : "Weiter"}
        </button>
        {canResume && <button type="button" className="secondary" onClick={onResume}>Letzte Eingabe fortsetzen</button>}
      </div>
    </section>
  );
}

export function SetupPreviewStep({
  game,
  activeSet,
  servingTeam,
  firstServerTeamA,
  firstServerTeamB,
  captainTeamA,
  captainTeamB,
  sideChangeInterval,
  onBack,
  onStart,
}: {
  game: Game;
  activeSet: 1 | 2 | 3;
  servingTeam: "A" | "B" | "";
  firstServerTeamA: string;
  firstServerTeamB: string;
  captainTeamA: string;
  captainTeamB: string;
  sideChangeInterval: 5 | 7 | null;
  onBack: () => void;
  onStart: () => void;
}) {
  const teamAPlayers = playersForTeam(game.team_a, game.team_a_players);
  const teamBPlayers = playersForTeam(game.team_b, game.team_b_players);
  const servingTeamLabel = servingTeam === "A"
    ? game.team_a || "Team A"
    : servingTeam === "B"
      ? game.team_b || "Team B"
      : "-";
  const secondServerTeamA = secondServer(teamAPlayers, firstServerTeamA);
  const secondServerTeamB = secondServer(teamBPlayers, firstServerTeamB);

  return (
    <section className="score-step-card setup-preview-card">
      <h2 className="question-title">Alles richtig?</h2>
      <ul className="setup-review-checklist" aria-label="Erfasste Spielparameter">
        <li><span>Satz</span><strong>{activeSet}, Seitenwechsel alle {sideChangeInterval ?? "-"} Punkte</strong></li>
        <li><span>1. Aufschlag</span><strong>{shortTeamLabel(servingTeamLabel, servingTeamLabel)}</strong></li>
        <li><span>{shortTeamLabel(game.team_a, "Team A")}</span><strong>{firstServerTeamA || "-"}, dann {secondServerTeamA || "-"}</strong></li>
        <li><span>{shortTeamLabel(game.team_b, "Team B")}</span><strong>{firstServerTeamB || "-"}, dann {secondServerTeamB || "-"}</strong></li>
        {activeSet === 1 && (
          <li><span>Kapitäne</span><strong>{captainTeamA || "-"} / {captainTeamB || "-"}</strong></li>
        )}
      </ul>
      <div className="score-flow-actions setup-preview-actions">
        <button type="button" className="secondary" onClick={onBack}>Zurück</button>
        <button type="button" onClick={onStart} disabled={!servingTeam || !firstServerTeamA || !firstServerTeamB || !sideChangeInterval}>
          Satz starten
        </button>
      </div>
    </section>
  );
}

export function ManualResultTable({
  game,
  draft,
  onUpdate,
  onFocusSet,
  onBlurSet,
}: {
  game: Game;
  draft: GameDraft;
  onUpdate: UpdateDraftField;
  onFocusSet: (setIndex: 0 | 1 | 2) => void;
  onBlurSet: (setIndex: 0 | 1 | 2, nextSetIndex: 0 | 1 | 2 | null) => void;
}) {
  const rows: Array<{
    label: string;
    teamAKey: keyof Pick<GameDraft, "set1_team_a" | "set2_team_a" | "set3_team_a">;
    teamBKey: keyof Pick<GameDraft, "set1_team_b" | "set2_team_b" | "set3_team_b">;
  }> = [
    { label: "Satz 1", teamAKey: "set1_team_a", teamBKey: "set1_team_b" },
    { label: "Satz 2", teamAKey: "set2_team_a", teamBKey: "set2_team_b" },
    { label: "Satz 3", teamAKey: "set3_team_a", teamBKey: "set3_team_b" },
  ];
  const thirdSetLocked = hasTwoSetLeadAfterSecondSet(draft);

  return (
    <div className="manual-result-table" role="group" aria-label="Ergebnis eintragen">
      <div className="manual-result-head"></div>
      <div className="manual-result-head">{shortTeamLabel(game.team_a, "Team 1")}</div>
      <div className="manual-result-head">{shortTeamLabel(game.team_b, "Team 2")}</div>
      {rows.map((row, index) => (
        <React.Fragment key={row.label}>
          <div className="manual-result-set">{row.label}</div>
          <ScoreInput
            value={draft[row.teamAKey]}
            onChange={(value) => onUpdate(row.teamAKey, value)}
            onFocus={() => onFocusSet(index as 0 | 1 | 2)}
            onBlur={(event) => onBlurSet(index as 0 | 1 | 2, manualSetIndexFromElement(event.relatedTarget))}
            readOnly={index === 2 && thirdSetLocked}
            manualSetIndex={index as 0 | 1 | 2}
            label={`${row.label} ${game.team_a || "Team 1"}`}
          />
          <ScoreInput
            value={draft[row.teamBKey]}
            onChange={(value) => onUpdate(row.teamBKey, value)}
            onFocus={() => onFocusSet(index as 0 | 1 | 2)}
            onBlur={(event) => onBlurSet(index as 0 | 1 | 2, manualSetIndexFromElement(event.relatedTarget))}
            readOnly={index === 2 && thirdSetLocked}
            manualSetIndex={index as 0 | 1 | 2}
            label={`${row.label} ${game.team_b || "Team 2"}`}
          />
        </React.Fragment>
      ))}
    </div>
  );
}

export function ManualResultValidation({ validation }: { validation: { errors: string[]; valid: boolean } }) {
  if (validation.errors.length === 0) {
    return null;
  }
  return (
    <div className="manual-result-validation" aria-live="polite">
      {validation.errors.map((error) => <span key={error} className="error-text">{error}</span>)}
    </div>
  );
}

function manualSetIndexFromElement(element: EventTarget | null): 0 | 1 | 2 | null {
  if (!(element instanceof HTMLElement)) {
    return null;
  }
  const value = element.dataset.manualSet;
  if (value === "0" || value === "1" || value === "2") {
    return Number.parseInt(value, 10) as 0 | 1 | 2;
  }
  return null;
}

export function ServerSelectionStep({
  game,
  activeSet,
  servingTeam,
  firstServerTeamA,
  firstServerTeamB,
  captainTeamA,
  captainTeamB,
  onChangeServingTeam,
  onChangeTeamA,
  onChangeTeamB,
  onChangeCaptainTeamA,
  onChangeCaptainTeamB,
  sideChangeInterval,
  onChangeSideInterval,
  step,
  onChangeStep,
  onBack,
  onContinue,
}: {
  game: Game;
  activeSet: 1 | 2 | 3;
  servingTeam: "A" | "B" | "";
  firstServerTeamA: string;
  firstServerTeamB: string;
  captainTeamA: string;
  captainTeamB: string;
  onChangeServingTeam: (value: "A" | "B" | "") => void;
  onChangeTeamA: (value: string) => void;
  onChangeTeamB: (value: string) => void;
  onChangeCaptainTeamA: (value: string) => void;
  onChangeCaptainTeamB: (value: string) => void;
  sideChangeInterval: 5 | 7 | null;
  onChangeSideInterval: (value: 5 | 7 | null) => void;
  step: ServerSetupStep;
  onChangeStep: (value: ServerSetupStep) => void;
  onBack: () => void;
  onContinue: (sideChangeInterval: 5 | 7) => void;
}) {
  const setStep = onChangeStep;
  const [pendingChoice, setPendingChoice] = useState("");
  const pendingTimerRef = useRef<number | null>(null);
  const teamAPlayers = playersForTeam(game.team_a, game.team_a_players);
  const teamBPlayers = playersForTeam(game.team_b, game.team_b_players);
  const secondServerTeamA = secondServer(teamAPlayers, firstServerTeamA);
  const secondServerTeamB = secondServer(teamBPlayers, firstServerTeamB);
  const secondServerPlaceholderTeamA = `2. Aufschläger: ${teamAPlayers.join(" / ")}`;
  const secondServerPlaceholderTeamB = `2. Aufschläger: ${teamBPlayers.join(" / ")}`;
  const askCaptains = activeSet === 1;
  const steps: ServerSetupStep[] = askCaptains
    ? ["captain-a", "captain-b", "serve-team", "team-a", "team-b", "side-change"]
    : ["serve-team", "team-a", "team-b", "side-change"];
  const stepIndex = steps.indexOf(step) + 1;
  const stepTitle = step === "captain-a"
    ? "Kapitän?"
    : step === "captain-b"
      ? "Kapitän?"
      : step === "serve-team"
        ? "Erster Aufschlag?"
        : step === "team-a" || step === "team-b"
          ? "Erster Aufschläger?"
          : step === "side-change"
            ? "Seitenwechsel"
            : "";
  const stepContext = step === "captain-a" || step === "team-a"
    ? game.team_a || "Team A"
    : step === "captain-b" || step === "team-b"
      ? game.team_b || "Team B"
      : "";

  useEffect(() => {
    setPendingChoice("");
    if (pendingTimerRef.current) {
      window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
  }, [step]);

  useEffect(() => {
    return () => {
      if (pendingTimerRef.current) {
        window.clearTimeout(pendingTimerRef.current);
      }
    };
  }, []);

  function choiceClass(selected: boolean, id: string) {
    return ["choice-button", selected ? "selected" : "", pendingChoice === id ? "confirming" : ""]
      .filter(Boolean)
      .join(" ");
  }

  function confirmChoice(id: string, apply: () => void, next: () => void) {
    if (pendingChoice) {
      return;
    }
    setPendingChoice(id);
    apply();
    pendingTimerRef.current = window.setTimeout(() => {
      pendingTimerRef.current = null;
      next();
    }, 450);
  }

  function chooseSideChangeInterval(interval: 5 | 7) {
    confirmChoice(`side-change-${interval}`, () => onChangeSideInterval(interval), () => onContinue(interval));
  }

  function chooseFirstServerTeamA(player: string) {
    confirmChoice(`team-a-${player}`, () => onChangeTeamA(player), () => setStep("team-b"));
  }

  function chooseCaptainTeamA(player: string) {
    confirmChoice(`captain-a-${player}`, () => onChangeCaptainTeamA(player), () => setStep("captain-b"));
  }

  function chooseFirstServerTeamB(player: string) {
    confirmChoice(`team-b-${player}`, () => onChangeTeamB(player), () => setStep("side-change"));
  }

  function chooseCaptainTeamB(player: string) {
    confirmChoice(`captain-b-${player}`, () => onChangeCaptainTeamB(player), () => setStep("serve-team"));
  }

  return (
    <section className="score-step-card server-step-card">
      <ServerSetupProgress current={stepIndex} total={steps.length} />
      <div className="setup-question-slot">
        {stepTitle && <h2 className="question-title">{stepTitle}</h2>}
        <div className={stepContext ? "setup-question-context" : "setup-question-context empty"} aria-hidden={!stepContext}>
          {stepContext || "Team Platzhalter"}
        </div>
      </div>

      {step === "captain-a" && (
        <div className="choice-group">
          <div className="choice-buttons">
            {teamAPlayers.map((player) => (
              <button type="button" key={player} className={choiceClass(captainTeamA === player, `captain-a-${player}`)} onClick={() => chooseCaptainTeamA(player)} disabled={Boolean(pendingChoice)}>
                {player}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "captain-b" && (
        <div className="choice-group">
          <div className="choice-buttons">
            {teamBPlayers.map((player) => (
              <button type="button" key={player} className={choiceClass(captainTeamB === player, `captain-b-${player}`)} onClick={() => chooseCaptainTeamB(player)} disabled={Boolean(pendingChoice)}>
                {player}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "serve-team" && (
        <div className="choice-group">
          <div className="choice-buttons">
            <button type="button" className={choiceClass(servingTeam === "A", "serve-team-A")} onClick={() => confirmChoice("serve-team-A", () => onChangeServingTeam("A"), () => setStep("team-a"))} disabled={Boolean(pendingChoice)}>
              <strong>{game.team_a || "Team A"}</strong>
            </button>
            <button type="button" className={choiceClass(servingTeam === "B", "serve-team-B")} onClick={() => confirmChoice("serve-team-B", () => onChangeServingTeam("B"), () => setStep("team-a"))} disabled={Boolean(pendingChoice)}>
              <strong>{game.team_b || "Team B"}</strong>
            </button>
          </div>
        </div>
      )}

      {step === "team-a" && (
        <div className="choice-group">
          <div className="choice-buttons">
            {teamAPlayers.map((player) => (
              <button type="button" key={player} className={choiceClass(firstServerTeamA === player, `team-a-${player}`)} onClick={() => chooseFirstServerTeamA(player)} disabled={Boolean(pendingChoice)}>
                {player}
              </button>
            ))}
          </div>
          <span className={firstServerTeamA ? "derived-server" : "derived-server pending"}>{firstServerTeamA ? `2. Aufschläger: ${secondServerTeamA || "-"}` : secondServerPlaceholderTeamA}</span>
        </div>
      )}

      {step === "team-b" && (
        <div className="choice-group">
          <div className="choice-buttons">
            {teamBPlayers.map((player) => (
              <button type="button" key={player} className={choiceClass(firstServerTeamB === player, `team-b-${player}`)} onClick={() => chooseFirstServerTeamB(player)} disabled={Boolean(pendingChoice)}>
                {player}
              </button>
            ))}
          </div>
          <span className={firstServerTeamB ? "derived-server" : "derived-server pending"}>{firstServerTeamB ? `2. Aufschläger: ${secondServerTeamB || "-"}` : secondServerPlaceholderTeamB}</span>
        </div>
      )}

      {step === "side-change" && (
        <div className="choice-group">
          <div className="choice-buttons">
            <button type="button" className={choiceClass(sideChangeInterval === 5, "side-change-5")} onClick={() => chooseSideChangeInterval(5)} disabled={Boolean(pendingChoice)}>
              <span>Seitenwechsel</span>
              <strong>alle 5 Punkte</strong>
            </button>
            <button type="button" className={choiceClass(sideChangeInterval === 7, "side-change-7")} onClick={() => chooseSideChangeInterval(7)} disabled={Boolean(pendingChoice)}>
              <span>Seitenwechsel</span>
              <strong>alle 7 Punkte</strong>
            </button>
          </div>
        </div>
      )}

      <div className="score-flow-actions">
        {step === "captain-a" && <button type="button" className="secondary setup-back-button" onClick={onBack} disabled={Boolean(pendingChoice)}>Zurück</button>}
        {step === "captain-b" && <button type="button" className="secondary setup-back-button" onClick={() => setStep("captain-a")} disabled={Boolean(pendingChoice)}>Zurück</button>}
        {step === "serve-team" && <button type="button" className="secondary setup-back-button" onClick={() => askCaptains ? setStep("captain-b") : onBack()} disabled={Boolean(pendingChoice)}>Zurück</button>}
        {step === "team-a" && <button type="button" className="secondary setup-back-button" onClick={() => setStep("serve-team")} disabled={Boolean(pendingChoice)}>Zurück</button>}
        {step === "team-b" && <button type="button" className="secondary setup-back-button" onClick={() => setStep("team-a")} disabled={Boolean(pendingChoice)}>Zurück</button>}
        {step === "side-change" && <button type="button" className="secondary setup-back-button" onClick={() => setStep("team-b")} disabled={Boolean(pendingChoice)}>Zurück</button>}
      </div>
    </section>
  );
}

function ServerSetupProgress({ current, total }: { current: number; total: number }) {
  return (
    <div className="setup-progress" style={{ "--setup-step-count": total } as React.CSSProperties} aria-label={`Schritt ${current} von ${total}`}>
      <span>{current}/{total}</span>
      <div>
        {Array.from({ length: total }).map((_, index) => (
          <i key={index} className={index < current ? "active" : ""} />
        ))}
      </div>
    </div>
  );
}

export function LiveSetStep({
  game,
  saving,
  draft,
  activeSet,
  leftTeam,
  setScore,
  servingTeam,
  serverIndex,
  liveError,
  firstServerTeamA,
  firstServerTeamB,
  captainTeamA,
  captainTeamB,
  sideChangeInterval,
  correctionMode,
  canUndo,
  lastPointTeam,
  sideChangeAck,
  isSwappingSides,
  timeoutScore,
  activeTimeoutTeam,
  timeoutRemaining,
  onSwapSides,
  onPointChange,
  onTimeout,
  onEndTimeout,
  onUndo,
  onToggleCorrection,
  onBack,
  onFinishSet,
  onSpecialRating,
}: {
  game: Game;
  saving: boolean;
  draft: GameDraft;
  activeSet: 1 | 2 | 3;
  leftTeam: TeamKey;
  setScore: Record<TeamKey, number>;
  servingTeam: TeamKey;
  serverIndex: Record<TeamKey, number>;
  liveError: string;
  firstServerTeamA: string;
  firstServerTeamB: string;
  captainTeamA: string;
  captainTeamB: string;
  sideChangeInterval: 5 | 7;
  correctionMode: boolean;
  canUndo: boolean;
  lastPointTeam: TeamKey | null;
  sideChangeAck: number | null;
  isSwappingSides: boolean;
  timeoutScore: Record<TeamKey, string | null>;
  activeTimeoutTeam: TeamKey | null;
  timeoutRemaining: number;
  onSwapSides: () => void;
  onPointChange: (team: TeamKey, delta: 1 | -1) => void;
  onTimeout: (team: TeamKey) => void;
  onEndTimeout: () => void;
  onUndo: () => void;
  onToggleCorrection: () => void;
  onBack: () => void;
  onFinishSet: () => void;
  onSpecialRating: (rating: string) => void;
}) {
  const [showSpecialRatings, setShowSpecialRatings] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [confirmFinishSet, setConfirmFinishSet] = useState(false);
  const [confirmTimeoutTeam, setConfirmTimeoutTeam] = useState<TeamKey | null>(null);
  const teamOrders = {
    A: serviceOrder(playersForTeam(game.team_a, game.team_a_players), firstServerTeamA),
    B: serviceOrder(playersForTeam(game.team_b, game.team_b_players), firstServerTeamB),
  };
  const teams = leftTeam === "A" ? (["A", "B"] as const) : (["B", "A"] as const);
  const totalSetPoints = setScore.A + setScore.B;
  const shouldChangeSides = totalSetPoints > 0 && totalSetPoints % sideChangeInterval === 0 && sideChangeAck !== totalSetPoints;
  const sideChangeBlocking = shouldChangeSides && !isSwappingSides;
  const canFinishSet = isPlausibleSetResult(setScore);
  const setWinnerName = setScore.A > setScore.B
    ? game.team_a || "Team A"
    : game.team_b || "Team B";
  const activeTimeoutTeamName = activeTimeoutTeam === "A"
    ? game.team_a || "Team A"
    : activeTimeoutTeam === "B"
      ? game.team_b || "Team B"
      : "";
  const confirmTimeoutTeamName = confirmTimeoutTeam === "A"
    ? game.team_a || "Team A"
    : confirmTimeoutTeam === "B"
      ? game.team_b || "Team B"
      : "";
  const completedSets = completedSetRows({ ...game, ...draft });

  return (
    <section inert={saving} aria-busy={saving} className={correctionMode ? "live-set-card correcting" : "live-set-card"}>
      <div className="landscape-notice">Hoch- und Querformat werden unterstützt.</div>
      {completedSets.length > 0 && (
        <div className="live-set-results">
          {completedSets.map((row) => (
            <span key={row.label}>{row.label}: {setScoreForSide(row, leftTeam)}</span>
          ))}
        </div>
      )}
      <div className="live-set-title" aria-label={`Aktueller Satz ${activeSet}`}>Satz {activeSet}</div>
      {correctionMode && <div className="correction-mode-banner">Korrekturmodus aktiv</div>}
      {sideChangeBlocking && (
        <div className="side-change-modal-backdrop" role="presentation">
          <section className="side-change-dialog" role="dialog" aria-modal="true" aria-labelledby="side-change-title">
            <h3 id="side-change-title">Seitenwechsel</h3>
            <p>{setScore.A}:{setScore.B}</p>
            <div className="side-change-actions">
              <button type="button" onClick={onSwapSides}>Seiten gewechselt</button>
            </div>
          </section>
        </div>
      )}
      {activeTimeoutTeam && (
        <div className="timeout-overlay" aria-live="polite">
          <span>Auszeit {activeTimeoutTeamName}</span>
          <strong>{timeoutRemaining}s</strong>
          <button type="button" className="timeout-end-button" onClick={onEndTimeout}>Beenden</button>
        </div>
      )}

      <div className={isSwappingSides ? "live-court swapping" : "live-court"}>
        <LiveTeamPanel
          team={teams[0]}
          players={teamOrders[teams[0]]}
          score={setScore[teams[0]]}
          currentServer={servingTeam === teams[0] ? teamOrders[teams[0]][serverIndex[teams[0]]] : ""}
          captain={teams[0] === "A" ? captainTeamA : captainTeamB}
          timeoutScore={timeoutScore[teams[0]]}
          highlighted={lastPointTeam === teams[0]}
          disabled={isSwappingSides || correctionMode || sideChangeBlocking}
          timeoutDisabled={isSwappingSides || correctionMode || sideChangeBlocking || Boolean(activeTimeoutTeam)}
          onPoint={() => onPointChange(teams[0], 1)}
          onTimeout={() => setConfirmTimeoutTeam(teams[0])}
        />
        <div className="live-center-controls">
          <button type="button" className={shouldChangeSides ? "swap-sides-button blink" : "swap-sides-button"} onClick={onSwapSides} disabled={isSwappingSides} aria-label="Seiten tauschen">
            <span className="swap-arrows" aria-hidden="true"><b>←</b><b>→</b></span>
            <span className="swap-label">Wechsel</span>
          </button>
          <button type="button" className="undo-point-button" onClick={onUndo} disabled={!canUndo || sideChangeBlocking} aria-label="Letzte Punkteingabe rückgängig">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
            </svg>
          </button>
          <button type="button" className={showActions ? "more-actions-button active" : "more-actions-button"} onClick={() => setShowActions((current) => !current)} disabled={sideChangeBlocking} aria-label="Weitere Aktionen">⋯</button>
        </div>
        <LiveTeamPanel
          team={teams[1]}
          players={teamOrders[teams[1]]}
          score={setScore[teams[1]]}
          currentServer={servingTeam === teams[1] ? teamOrders[teams[1]][serverIndex[teams[1]]] : ""}
          captain={teams[1] === "A" ? captainTeamA : captainTeamB}
          timeoutScore={timeoutScore[teams[1]]}
          highlighted={lastPointTeam === teams[1]}
          disabled={isSwappingSides || correctionMode || sideChangeBlocking}
          timeoutDisabled={isSwappingSides || correctionMode || sideChangeBlocking || Boolean(activeTimeoutTeam)}
          onPoint={() => onPointChange(teams[1], 1)}
          onTimeout={() => setConfirmTimeoutTeam(teams[1])}
        />
      </div>
      {confirmTimeoutTeam && (
        <div className="timeout-confirm-backdrop" role="presentation">
          <section className="timeout-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="timeout-confirm-title">
            <h3 id="timeout-confirm-title">Auszeit</h3>
            <p>{confirmTimeoutTeamName}</p>
            <span>Teams haben 15 Sekunden, das Feld zu verlassen. Danach kann die Auszeit starten.</span>
            <div className="timeout-confirm-actions">
              <button type="button" className="secondary" onClick={() => setConfirmTimeoutTeam(null)}>Abbrechen</button>
              <button type="button" onClick={() => { onTimeout(confirmTimeoutTeam); setConfirmTimeoutTeam(null); }}>Auszeit starten</button>
            </div>
          </section>
        </div>
      )}

      {(liveError || canFinishSet) && (
        <div className="score-flow-actions">
          {liveError && <span className="live-save-state error-text">{liveError}</span>}
          {canFinishSet && <button type="button" onClick={() => setConfirmFinishSet(true)}>Satz {activeSet} abschließen</button>}
        </div>
      )}
      {confirmFinishSet && (
        <div className="modal-backdrop" role="presentation">
          <section className="finish-set-dialog" role="dialog" aria-modal="true" aria-labelledby="finish-set-title">
            <h3 id="finish-set-title">Satz {activeSet} beendet</h3>
            <p><strong>{setWinnerName}</strong> gewinnt {setScore.A}:{setScore.B}</p>
            <div className="finish-set-actions">
              <button type="button" className="secondary" onClick={() => {
                setConfirmFinishSet(false);
                if (!correctionMode) {
                  onToggleCorrection();
                }
              }}>Ergebnis korrigieren</button>
              <button type="button" onClick={() => { setConfirmFinishSet(false); onFinishSet(); }}>Satz bestätigen</button>
            </div>
          </section>
        </div>
      )}
      {showActions && (
        <div className="live-action-panel">
          <button type="button" className="secondary" onClick={onBack}>Satzdaten bearbeiten</button>
          <button type="button" className="secondary" onClick={onToggleCorrection}>Punktestand korrigieren</button>
          <button type="button" className="secondary end-game-button" onClick={() => setShowSpecialRatings((current) => !current)}>Spiel beenden</button>
        </div>
      )}
      {correctionMode && (
        <div className="score-correction-panel">
          <div className="choice-label">Punktestand korrigieren</div>
          <div className="score-correction-grid">
            <strong>{game.team_a || "Team A"}</strong>
            <strong>{game.team_b || "Team B"}</strong>
            <span>{setScore.A}</span>
            <span>{setScore.B}</span>
            <button type="button" className="secondary" onClick={() => onPointChange("A", -1)}>-</button>
            <button type="button" className="secondary" onClick={() => onPointChange("B", -1)}>-</button>
            <button type="button" onClick={() => onPointChange("A", 1)}>+</button>
            <button type="button" onClick={() => onPointChange("B", 1)}>+</button>
          </div>
          <button type="button" className="secondary" onClick={onToggleCorrection}>Fertig</button>
        </div>
      )}
      {showSpecialRatings && (
        <div className="special-rating-panel">
          <div className="choice-label">Warum wird das Spiel vorzeitig beendet?</div>
          <div className="special-rating-teams">
            <span><strong>Team A</strong>{game.team_a || "Team A"}</span>
            <span><strong>Team B</strong>{game.team_b || "Team B"}</span>
          </div>
          <div className="special-rating-grid">
            {specialGameRatingOptions.map((option) => (
              <button type="button" key={option} className="secondary" onClick={() => onSpecialRating(option)}>
                {option}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function FinalReviewStep({
  game,
  draft,
  saving,
  onBack,
  onConfirm,
}: {
  game: Game;
  draft: GameDraft;
  saving: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const result = completedResultParts({ ...game, ...draft });
  return (
    <section className="final-review-card">
      <h2>Spiel abschließen?</h2>
      <div className="final-winner-panel">
        <span>Sieger</span>
        <strong>{draft.winner_team || "nicht eindeutig"}</strong>
      </div>
      <div className="final-set-summary">
        <div>
          <span>{game.team_a || "Team A"}</span>
          <strong>{result.teamA}</strong>
        </div>
        <div>
          <span>{game.team_b || "Team B"}</span>
          <strong>{result.teamB}</strong>
        </div>
      </div>
      <div className="score-flow-actions">
        <button type="button" className="secondary" onClick={onBack}>Zurück</button>
        <button type="button" onClick={onConfirm} disabled={saving}>{saving ? "Speichert..." : `Sieger bestätigen: ${draft.winner_team || "-"}`}</button>
      </div>
    </section>
  );
}

export function ThankYouStep({ game, draft, onNextGame }: { game: Game; draft: GameDraft; onNextGame?: () => void }) {
  const completedGame = { ...game, ...draft };
  const result = completedResultParts(completedGame);
  const winnerSide = completedWinnerSide(completedGame);
  return (
    <section className="thank-you-card">
      <h2>Spiel abgeschlossen</h2>
      <div className="completed-result-card">
        <div className="mobile-result-team-list">
          <div className={winnerSide === "A" ? "mobile-result-team winner" : "mobile-result-team"}>
            <strong>A</strong>
            <span>{game.team_a || "Team 1"}</span>
            <small className={setPointClass(completedGame, 1, "A")}>{draft.set1_team_a || "-"}</small>
            <small className={setPointClass(completedGame, 2, "A")}>{draft.set2_team_a || "-"}</small>
            <small className={setPointClass(completedGame, 3, "A")}>{draft.set3_team_a || "-"}</small>
            <b>{result.teamA}</b>
          </div>
          <div className={winnerSide === "B" ? "mobile-result-team winner" : "mobile-result-team"}>
            <strong>B</strong>
            <span>{game.team_b || "Team 2"}</span>
            <small className={setPointClass(completedGame, 1, "B")}>{draft.set1_team_b || "-"}</small>
            <small className={setPointClass(completedGame, 2, "B")}>{draft.set2_team_b || "-"}</small>
            <small className={setPointClass(completedGame, 3, "B")}>{draft.set3_team_b || "-"}</small>
            <b>{result.teamB}</b>
          </div>
        </div>
      </div>
      {onNextGame && (
        <div className="score-flow-actions">
          <button type="button" onClick={onNextGame}>Nächstes Spiel laden</button>
        </div>
      )}
    </section>
  );
}

function LiveTeamPanel({
  team,
  players,
  score,
  currentServer,
  captain,
  timeoutScore,
  highlighted,
  disabled,
  timeoutDisabled,
  onPoint,
  onTimeout,
}: {
  team: TeamKey;
  players: string[];
  score: number;
  currentServer: string;
  captain: string;
  timeoutScore: string | null;
  highlighted: boolean;
  disabled: boolean;
  timeoutDisabled: boolean;
  onPoint: () => void;
  onTimeout: () => void;
}) {
  return (
    <div className={highlighted ? "live-team-panel point-flash" : "live-team-panel"}>
      <span className="sr-only">Team {team}</span>
      <button type="button" className="team-point-button" onClick={onPoint} disabled={disabled}>
        <div className="serve-order-list">
          {players.map((player) => (
            <div key={player} className={player === currentServer ? "serve-player active-server" : "serve-player"}>
              <span>{player}{player === captain ? " (C)" : ""}</span>
              <span className="ball-icon" aria-label={player === currentServer ? "Aufschlag" : undefined}>{player === currentServer ? "" : ""}</span>
            </div>
          ))}
        </div>
        <strong className="live-score">{score}</strong>
        <span className="tap-plus">+</span>
      </button>
      <div className="timeout-row">
        <button type="button" className="timeout-button" onClick={onTimeout} disabled={timeoutDisabled || Boolean(timeoutScore)}>
          Auszeit
        </button>
        {timeoutScore && <span className="timeout-score">bei {timeoutScore}</span>}
      </div>
    </div>
  );
}

function ScoreInput({
  value,
  label,
  onChange,
  onFocus,
  onBlur,
  readOnly = false,
  manualSetIndex,
}: {
  value: string | null;
  label: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
  readOnly?: boolean;
  manualSetIndex?: 0 | 1 | 2;
}) {
  return <input inputMode="numeric" value={value ?? ""} onChange={(event) => onChange(event.target.value)} onFocus={onFocus} onBlur={onBlur} readOnly={readOnly} data-manual-set={manualSetIndex} aria-label={label} />;
}
