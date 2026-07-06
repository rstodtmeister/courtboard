import React, { FormEvent, useEffect, useRef, useState } from "react";
import { gameRatingOptions, noRefereeSelection, specialGameRatingOptions } from "./appConfig";
import { loadScoreEntry, submitScore } from "./dataApi";
import { clearSetScore, completedSetRows, draftFromGame, draftWithSetScore, finalSetRows, hasTwoSetLeadAfterSecondSet, isPlausibleSetResult, parsePointHistory, parseScore, parseTimeoutHistory, scoreForSet, secondServer, serializePointHistory, serviceOrder, setScoreForSide, validateManualResult, withScoreAutomation } from "./scoreLogic";
import type { Game, GameDraft, ScoreEntryData } from "./types";
import type { LiveSnapshot, ScoreEntryResumeState, ScoreWorkflowStep, ServerSetupStep, TeamKey } from "./workflowTypes";

function LockedScoreEntry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="score-step-card locked-entry-card">
      <h2>Dieses Spiel ist bereits geoeffnet</h2>
      <p>{message}</p>
      <p>Falls das falsche Geraet verbunden ist, kann der Admin die Eingabe fuer den Court entsperren.</p>
      <button type="button" onClick={onRetry}>Erneut pruefen</button>
    </div>
  );
}

function ScoreContextBox({ game, draft, showReferee }: { game: Game; draft: GameDraft; showReferee: boolean }) {
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

type CompletedScoreEntryState = {
  game: Game;
  draft: GameDraft;
  completedAt: string;
};

const completedScoreEntryTtlMs = 5 * 60 * 1000;

export function ScoreEntryApp({ token }: { token: string }) {
  const [data, setData] = useState<ScoreEntryData | null>(null);
  const [selectedGameId, setSelectedGameId] = useState("");
  const [draft, setDraft] = useState<GameDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workflowStep, setWorkflowStep] = useState<ScoreWorkflowStep>("confirm");
  const [serverSetupStep, setServerSetupStep] = useState<ServerSetupStep>("captain-a");
  const [resumeState, setResumeState] = useState<ScoreEntryResumeState | null>(null);
  const [completedState, setCompletedState] = useState<CompletedScoreEntryState | null>(null);
  const [resumeReady, setResumeReady] = useState(false);
  const [finalEditing, setFinalEditing] = useState(false);
  const [manualFocusedSet, setManualFocusedSet] = useState<0 | 1 | 2 | null>(null);
  const [manualTouchedSets, setManualTouchedSets] = useState<Array<0 | 1 | 2>>([]);
  const [activeSet, setActiveSet] = useState<1 | 2 | 3>(1);
  const [servingTeam, setServingTeam] = useState<TeamKey | "">("");
  const [firstServerTeamA, setFirstServerTeamA] = useState("");
  const [firstServerTeamB, setFirstServerTeamB] = useState("");
  const [captainTeamA, setCaptainTeamA] = useState("");
  const [captainTeamB, setCaptainTeamB] = useState("");
  const [sideChangeInterval, setSideChangeInterval] = useState<5 | 7 | null>(null);
  const [leftTeam, setLeftTeam] = useState<TeamKey>("A");
  const [setScore, setSetScore] = useState<Record<TeamKey, number>>({ A: 0, B: 0 });
  const [serverIndex, setServerIndex] = useState<Record<TeamKey, number>>({ A: 0, B: 0 });
  const [serveCounts, setServeCounts] = useState<Record<TeamKey, number>>({ A: 0, B: 0 });
  const [pointHistory, setPointHistory] = useState<LiveSnapshot[]>([]);
  const [correctionMode, setCorrectionMode] = useState(false);
  const [lastPointTeam, setLastPointTeam] = useState<TeamKey | null>(null);
  const [sideChangeAck, setSideChangeAck] = useState<number | null>(null);
  const [isSwappingSides, setIsSwappingSides] = useState(false);
  const [timeoutScore, setTimeoutScore] = useState<Record<TeamKey, string | null>>({ A: null, B: null });
  const [activeTimeoutTeam, setActiveTimeoutTeam] = useState<TeamKey | null>(null);
  const [timeoutRemaining, setTimeoutRemaining] = useState(0);
  const [error, setError] = useState("");
  const [lockedMessage, setLockedMessage] = useState("");
  const [liveError, setLiveError] = useState("");
  const [message, setMessage] = useState("");

  async function loadEntry() {
    setLoading(true);
    setError("");
    setLockedMessage("");

    try {
      const savedCompletedState = loadCompletedScoreEntry(token);
      if (savedCompletedState) {
        setSelectedGameId(savedCompletedState.game.id);
        setDraft(savedCompletedState.draft);
        setData({
          link: {
            id: "",
            game_id: savedCompletedState.game.id,
            court: savedCompletedState.game.court,
            expires_at: null,
            used_at: null,
          },
          games: [savedCompletedState.game],
          allTeams: [],
        });
        setCompletedState(savedCompletedState);
        setWorkflowStep("done");
        return;
      }

      const entryData = await loadScoreEntry(token);
      setData(entryData);
      const firstGame = entryData.games[0];
      if (firstGame) {
        setSelectedGameId(firstGame.id);
        setDraft(draftFromGame(firstGame));
      }
      const savedState = loadScoreEntryResume(token);
      if (savedState && entryData.games.some((game) => game.id === savedState.gameId && !game.completed)) {
        setResumeState(savedState);
      }
    } catch (invokeError) {
      const text = invokeError instanceof Error ? invokeError.message : "Der Ergebnislink konnte nicht geladen werden.";
      if (text.includes("anderen Geraet")) {
        setLockedMessage(text);
      } else {
        setError(text);
      }
    } finally {
      setResumeReady(true);
      setLoading(false);
    }
  }

  useEffect(() => {
    async function load() {
      await loadEntry();
    }

    load();
  }, [token]);

  const selectedGame = data?.games.find((game) => game.id === selectedGameId) ?? null;

  useEffect(() => {
    if (!activeTimeoutTeam) {
      return;
    }
    if (timeoutRemaining <= 0) {
      setActiveTimeoutTeam(null);
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setTimeoutRemaining((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(timeoutId);
  }, [activeTimeoutTeam, timeoutRemaining]);

  useEffect(() => {
    if (!resumeReady || !selectedGameId || !draft || workflowStep === "confirm" || workflowStep === "done") {
      return;
    }
    saveScoreEntryResume(token, {
      gameId: selectedGameId,
      draft,
      workflowStep,
      serverSetupStep,
      activeSet,
      servingTeam,
      firstServerTeamA,
      firstServerTeamB,
      captainTeamA,
      captainTeamB,
      sideChangeInterval,
      leftTeam,
      setScore,
      serverIndex,
      serveCounts,
      correctionMode,
      sideChangeAck,
      timeoutScore,
      activeTimeoutTeam,
      timeoutRemaining,
    });
  }, [
    resumeReady,
    token,
    selectedGameId,
    draft,
    workflowStep,
    serverSetupStep,
    activeSet,
    servingTeam,
    firstServerTeamA,
    firstServerTeamB,
    captainTeamA,
    captainTeamB,
    sideChangeInterval,
    leftTeam,
    setScore,
    serverIndex,
    serveCounts,
    correctionMode,
    sideChangeAck,
    timeoutScore,
    activeTimeoutTeam,
    timeoutRemaining,
  ]);

  useEffect(() => {
    if (!draft || !finalEditing || !hasTwoSetLeadAfterSecondSet(draft) || (!draft.set3_team_a && !draft.set3_team_b)) {
      return;
    }
    setDraft((current) => current ? withScoreAutomation({ ...current, set3_team_a: "", set3_team_b: "" }) : current);
  }, [draft, finalEditing]);

  function selectGame(gameId: string) {
    const nextGame = data?.games.find((game) => game.id === gameId);
    setSelectedGameId(gameId);
    setDraft(nextGame ? draftFromGame(nextGame) : null);
    setWorkflowStep("confirm");
    setServerSetupStep("captain-a");
    setResumeState(null);
    setCompletedState(null);
    setFinalEditing(false);
    setManualFocusedSet(null);
    setManualTouchedSets([]);
    setActiveSet(1);
    setServingTeam("");
    setFirstServerTeamA("");
    setFirstServerTeamB("");
    setCaptainTeamA("");
    setCaptainTeamB("");
    setSideChangeInterval(null);
    setLeftTeam("A");
    setSetScore({ A: 0, B: 0 });
    setServerIndex({ A: 0, B: 0 });
    setServeCounts({ A: 0, B: 0 });
    setPointHistory([]);
    setCorrectionMode(false);
    setLastPointTeam(null);
    setSideChangeAck(null);
    setIsSwappingSides(false);
    setTimeoutScore({ A: null, B: null });
    setActiveTimeoutTeam(null);
    setTimeoutRemaining(0);
    setMessage("");
    setError("");
    setLiveError("");
  }

  function resumeLastEntry() {
    if (!resumeState) {
      return;
    }
    setSelectedGameId(resumeState.gameId);
    setDraft(resumeState.draft);
    setWorkflowStep(resumeState.workflowStep);
    setServerSetupStep(resumeState.serverSetupStep);
    setFinalEditing(false);
    setActiveSet(resumeState.activeSet);
    setServingTeam(resumeState.servingTeam);
    setFirstServerTeamA(resumeState.firstServerTeamA);
    setFirstServerTeamB(resumeState.firstServerTeamB);
    setCaptainTeamA(resumeState.captainTeamA);
    setCaptainTeamB(resumeState.captainTeamB);
    setSideChangeInterval(resumeState.sideChangeInterval);
    setLeftTeam(resumeState.leftTeam);
    setSetScore(resumeState.setScore);
    setServerIndex(resumeState.serverIndex);
    setServeCounts(resumeState.serveCounts);
    setPointHistory([]);
    setCorrectionMode(resumeState.correctionMode);
    setLastPointTeam(null);
    setSideChangeAck(resumeState.sideChangeAck);
    setIsSwappingSides(false);
    setTimeoutScore(resumeState.timeoutScore);
    setActiveTimeoutTeam(resumeState.activeTimeoutTeam);
    setTimeoutRemaining(resumeState.timeoutRemaining);
    setMessage("");
    setError("");
    setLiveError("");
  }

  function update<K extends keyof GameDraft>(key: K, value: GameDraft[K]) {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      let nextDraft = withScoreAutomation({ ...current, [key]: value });
      if (hasTwoSetLeadAfterSecondSet(nextDraft) && (nextDraft.set3_team_a || nextDraft.set3_team_b)) {
        nextDraft = withScoreAutomation({ ...nextDraft, set3_team_a: "", set3_team_b: "" });
      }
      return nextDraft;
    });
  }

  function focusManualSet(setIndex: 0 | 1 | 2) {
    if (manualFocusedSet !== null && manualFocusedSet !== setIndex) {
      setManualTouchedSets((current) => [...new Set([...current, manualFocusedSet])] as Array<0 | 1 | 2>);
    }
    setManualFocusedSet(setIndex);
  }

  function blurManualSet(setIndex: 0 | 1 | 2, nextSetIndex: 0 | 1 | 2 | null) {
    if (nextSetIndex === setIndex) {
      return;
    }
    setManualTouchedSets((current) => [...new Set([...current, setIndex])] as Array<0 | 1 | 2>);
    setManualFocusedSet(null);
  }

  async function confirmReferee(referee: string) {
    if (!selectedGame || !draft) {
      return;
    }
    const nextDraft = { ...draft, referee };
    setSaving(true);
    setError("");
    try {
      await submitScore(token, selectedGame, nextDraft);
      setDraft(nextDraft);
      setData((current) => current ? {
        ...current,
        games: current.games.map((game) => game.id === selectedGame.id ? { ...game, referee } : game),
      } : current);
      if (!referee) {
        setFinalEditing(true);
        setWorkflowStep("scoring");
        return;
      }
      setWorkflowStep("servers");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Schiedsgericht konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  function startCurrentSet(nextSideChangeInterval: 5 | 7 = sideChangeInterval ?? 7) {
    if (!servingTeam || !nextSideChangeInterval) {
      return;
    }
    setSideChangeInterval(nextSideChangeInterval);
    setServerSetupStep("serve-team");
    const nextScore = scoreForSet(draft, activeSet);
    setLeftTeam("A");
    setSetScore(nextScore);
    setServerIndex({ A: 0, B: 0 });
    setServeCounts({ A: servingTeam === "A" ? 1 : 0, B: servingTeam === "B" ? 1 : 0 });
    setPointHistory([]);
    setCorrectionMode(false);
    setLastPointTeam(null);
    setSideChangeAck(null);
    setIsSwappingSides(false);
    setTimeoutScore({ A: null, B: null });
    setActiveTimeoutTeam(null);
    setTimeoutRemaining(0);
    setWorkflowStep("live");
  }

  async function persistLiveDraft(nextDraft: GameDraft) {
    if (!selectedGame) {
      return;
    }
    setLiveError("");
    try {
      await submitScore(token, selectedGame, nextDraft);
    } catch (submitError) {
      setLiveError(submitError instanceof Error ? submitError.message : "Live-Stand konnte nicht gespeichert werden.");
    }
  }

  function changeSetPoint(team: TeamKey, delta: 1 | -1) {
    if (!draft || isSwappingSides) {
      return;
    }
    setPointHistory((current) => [
      ...current,
      {
        draft,
        setScore,
        servingTeam,
        serverIndex,
        serveCounts,
        sideChangeAck,
      },
    ]);

    const nextScore = { ...setScore, [team]: Math.max(0, setScore[team] + delta) };
    const baseDraft = draftWithSetScore(draft, activeSet, nextScore);
    const nextDraft = withScoreAutomation({
      ...baseDraft,
      point_history: delta > 0
        ? serializePointHistory([
          ...parsePointHistory(draft.point_history),
          { set: activeSet, team, scoreA: nextScore.A, scoreB: nextScore.B },
        ])
        : draft.point_history,
    });
    const nextServerIndex = { ...serverIndex };
    const nextServeCounts = { ...serveCounts };
    let nextServingTeam = servingTeam;

    if (delta > 0 && servingTeam !== team) {
      if (serveCounts[team] > 0) {
        nextServerIndex[team] = serverIndex[team] === 0 ? 1 : 0;
      }
      nextServeCounts[team] = serveCounts[team] + 1;
      nextServingTeam = team;
    }

    setSetScore(nextScore);
    setDraft(nextDraft);
    setServerIndex(nextServerIndex);
    setServeCounts(nextServeCounts);
    setServingTeam(nextServingTeam);
    if (delta > 0) {
      setLastPointTeam(team);
      window.setTimeout(() => setLastPointTeam(null), 320);
    }
    void persistLiveDraft(nextDraft);
  }

  function undoLastPoint() {
    if (isSwappingSides) {
      return;
    }
    const previous = pointHistory[pointHistory.length - 1];
    if (!previous) {
      return;
    }
    setPointHistory((current) => current.slice(0, -1));
    setDraft(previous.draft);
    setSetScore(previous.setScore);
    setServingTeam(previous.servingTeam);
    setServerIndex(previous.serverIndex);
    setServeCounts(previous.serveCounts);
    setSideChangeAck(previous.sideChangeAck);
    setLastPointTeam(null);
    void persistLiveDraft(previous.draft);
  }

  function swapSides() {
    if (isSwappingSides) {
      return;
    }
    const totalPoints = setScore.A + setScore.B;
    setIsSwappingSides(true);
    window.setTimeout(() => {
      setLeftTeam((current) => current === "A" ? "B" : "A");
      setSideChangeAck(totalPoints);
    }, 1260);
    window.setTimeout(() => {
      setIsSwappingSides(false);
    }, 1300);
  }

  function takeTimeout(team: TeamKey) {
    if (!draft || timeoutScore[team]) {
      return;
    }
    setTimeoutScore((current) => ({ ...current, [team]: `${setScore[team]}:${setScore[team === "A" ? "B" : "A"]}` }));
    setActiveTimeoutTeam(team);
    setTimeoutRemaining(30);
    const nextDraft = {
      ...draft,
      point_history: serializePointHistory([
        ...parsePointHistory(draft.point_history),
        ...parseTimeoutHistory(draft.point_history),
        {
          type: "timeout" as const,
          set: activeSet,
          team,
          scoreA: setScore.A,
          scoreB: setScore.B,
          startedAt: new Date().toISOString(),
        },
      ]),
    };
    setDraft(nextDraft);
    void persistLiveDraft(nextDraft);
  }

  async function finishCurrentSet() {
    if (!draft) {
      return;
    }
    if (setScore.A === setScore.B) {
      setLiveError("Ein Satz kann nicht mit Gleichstand abgeschlossen werden.");
      return;
    }
    if (!isPlausibleSetResult(setScore)) {
      setLiveError("Satzabschluss ist erst ab 15 Punkten und 2 Punkten Vorsprung möglich.");
      return;
    }
    setLiveError("");
    const nextDraft = withScoreAutomation(draftWithSetScore(draft, activeSet, setScore));
    setDraft(nextDraft);
    await persistLiveDraft(nextDraft);

    const result = matchResult(nextDraft);
    if (result.teamA >= 2 || result.teamB >= 2 || activeSet === 3) {
      setFinalEditing(false);
      setWorkflowStep("scoring");
      return;
    }

    setActiveSet((current) => (current === 1 ? 2 : 3) as 1 | 2 | 3);
    setServingTeam("");
    setFirstServerTeamA("");
    setFirstServerTeamB("");
    setSideChangeInterval(null);
    setServerSetupStep("serve-team");
    setSetScore({ A: 0, B: 0 });
    setServerIndex({ A: 0, B: 0 });
    setServeCounts({ A: 0, B: 0 });
    setPointHistory([]);
    setCorrectionMode(false);
    setLastPointTeam(null);
    setSideChangeAck(null);
    setIsSwappingSides(false);
    setTimeoutScore({ A: null, B: null });
    setActiveTimeoutTeam(null);
    setTimeoutRemaining(0);
    setWorkflowStep("servers");
  }

  async function finishWithSpecialRating(rating: string) {
    if (!draft) {
      return;
    }
    const nextDraft = withScoreAutomation({
      ...draftWithSetScore(draft, activeSet, setScore),
      game_rating: rating,
      completed: false,
    });
    setDraft(nextDraft);
    await persistLiveDraft(nextDraft);
    setFinalEditing(false);
    setWorkflowStep("scoring");
  }

  async function confirmFinalResult(nextDraft: GameDraft | null = draft) {
    if (!nextDraft || !selectedGame) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const completedDraft = { ...nextDraft, completed: true, game_rating: nextDraft.game_rating || "Normal" };
      await submitScore(token, selectedGame, completedDraft);
      clearScoreEntryResume(token);
      const completedGame = { ...selectedGame, ...completedDraft, completed: true };
      const nextCompletedState = {
        game: completedGame,
        draft: completedDraft,
        completedAt: new Date().toISOString(),
      };
      saveCompletedScoreEntry(token, nextCompletedState);
      setCompletedState(nextCompletedState);
      setData((current) => current ? {
        ...current,
        games: [completedGame],
      } : current);
      setSelectedGameId(completedGame.id);
      setDraft(completedDraft);
      setResumeState(null);
      setMessage("Ergebnis gespeichert.");
      setWorkflowStep("done");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Ergebnis konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) {
      return;
    }
    const validation = validateManualResult(draft);
    if (finalEditing && !validation.valid) {
      setError(validation.errors[0] ?? "Bitte ein vollständiges Ergebnis eintragen.");
      return;
    }
    await confirmFinalResult(draft);
  }

  const manualResultValidation = draft ? validateManualResult(draft) : { errors: [], valid: false };
  const manualResultDisplayValidation = draft ? validateManualResult(draft, { touchedSets: manualTouchedSets }) : manualResultValidation;

  return (
    <main className="score-app">
      <section className="score-panel">
        <h1>{workflowStep === "scoring" && finalEditing && !draft?.referee ? "Ergebnis erfassen" : "Schiedsrichterbogen"}</h1>
        {!loading && !lockedMessage && selectedGame && draft && workflowStep !== "live" && (
          <ScoreContextBox game={selectedGame} draft={draft} showReferee={workflowStep !== "confirm"} />
        )}
        {loading && <div className="status">Link wird geladen...</div>}
        {!loading && lockedMessage && (
          <LockedScoreEntry message={lockedMessage} onRetry={loadEntry} />
        )}
        {error && <div className="error">{error}</div>}
        {message && <div className="success">{message}</div>}
        {!loading && !lockedMessage && selectedGame && draft && (
          <div className="score-form">
            {data && data.games.length > 1 && (
              <label>
                Spiel
                <select value={selectedGameId} onChange={(event) => selectGame(event.target.value)}>
                  {data.games.map((game) => (
                    <option key={game.id} value={game.id}>
                      {game.number} - {game.team_a} vs. {game.team_b}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {workflowStep === "confirm" && (
              <RefereeSelectStep
                game={selectedGame}
                games={data?.games ?? []}
                allTeams={data?.allTeams ?? []}
                draft={draft}
                saving={saving}
                canResume={Boolean(resumeState)}
                onConfirm={confirmReferee}
                onResume={resumeLastEntry}
              />
            )}

            {(workflowStep === "servers" || workflowStep === "preview") && (
              <ServerSelectionStep
                key={`${selectedGame.id}-${activeSet}`}
                game={selectedGame}
                servingTeam={servingTeam}
                firstServerTeamA={firstServerTeamA}
                firstServerTeamB={firstServerTeamB}
                captainTeamA={captainTeamA}
                captainTeamB={captainTeamB}
                onChangeServingTeam={setServingTeam}
                onChangeTeamA={setFirstServerTeamA}
                onChangeTeamB={setFirstServerTeamB}
                onChangeCaptainTeamA={setCaptainTeamA}
                onChangeCaptainTeamB={setCaptainTeamB}
                sideChangeInterval={sideChangeInterval}
                onChangeSideInterval={setSideChangeInterval}
                step={serverSetupStep}
                onChangeStep={setServerSetupStep}
                onBack={() => setWorkflowStep("confirm")}
                activeSet={activeSet}
                onContinue={(interval) => {
                  if (activeSet === 1) {
                    setWorkflowStep("setup-preview");
                    return;
                  }
                  startCurrentSet(interval);
                }}
              />
            )}

            {workflowStep === "setup-preview" && (
              <SetupPreviewStep
                game={selectedGame}
                activeSet={activeSet}
                servingTeam={servingTeam}
                firstServerTeamA={firstServerTeamA}
                firstServerTeamB={firstServerTeamB}
                captainTeamA={captainTeamA}
                captainTeamB={captainTeamB}
                sideChangeInterval={sideChangeInterval}
                onBack={() => {
                  setServerSetupStep("side-change");
                  setWorkflowStep("servers");
                }}
                onStart={() => startCurrentSet()}
              />
            )}

            {workflowStep === "live" && (
              <LiveSetStep
                game={selectedGame}
                draft={draft}
                leftTeam={leftTeam}
                setScore={setScore}
                servingTeam={servingTeam || "A"}
                serverIndex={serverIndex}
                liveError={liveError}
                activeSet={activeSet}
                firstServerTeamA={firstServerTeamA}
                firstServerTeamB={firstServerTeamB}
                captainTeamA={captainTeamA}
                captainTeamB={captainTeamB}
                sideChangeInterval={sideChangeInterval ?? 7}
                correctionMode={correctionMode}
                canUndo={pointHistory.length > 0}
                lastPointTeam={lastPointTeam}
                sideChangeAck={sideChangeAck}
                isSwappingSides={isSwappingSides}
                timeoutScore={timeoutScore}
                activeTimeoutTeam={activeTimeoutTeam}
                timeoutRemaining={timeoutRemaining}
                onSwapSides={swapSides}
                onPointChange={changeSetPoint}
                onTimeout={takeTimeout}
                onUndo={undoLastPoint}
                onToggleCorrection={() => setCorrectionMode((current) => !current)}
                onBack={() => setWorkflowStep("servers")}
                onFinishSet={finishCurrentSet}
                onSpecialRating={finishWithSpecialRating}
              />
            )}

            {workflowStep === "scoring" && (
              finalEditing ? (
                <form onSubmit={submit} className="score-form manual-result-form">
                  <ManualResultTable game={selectedGame} draft={draft} onUpdate={update} onFocusSet={focusManualSet} onBlurSet={blurManualSet} />
                  <ManualResultValidation validation={manualResultDisplayValidation} />

                  <div className="manual-result-summary">
                    <span>Ergebnis <strong>{draft.result || "-"}</strong></span>
                    <span>Sieger <strong>{draft.winner_team || "-"}</strong></span>
                  </div>
                  {draft.referee && (
                    <label>
                      Wertung
                      <select value={draft.game_rating ?? ""} onChange={(event) => update("game_rating", event.target.value)}>
                        {gameRatingOptions.map((option) => (
                          <option key={option || "empty"} value={option}>{option || "Wertung"}</option>
                        ))}
                      </select>
                    </label>
                  )}

                  <div className="score-flow-actions manual-result-actions">
                    <button type="submit" disabled={saving || !manualResultValidation.valid}>{saving ? "Speichert..." : manualResultValidation.valid ? "Ergebnis speichern" : "Ergebnis unvollständig"}</button>
                  </div>
                </form>
              ) : (
                <FinalReviewStep
                  game={selectedGame}
                  draft={draft}
                  saving={saving}
                  onBack={() => draft.referee ? setWorkflowStep("live") : setFinalEditing(true)}
                  onEdit={() => setFinalEditing(true)}
                  onConfirm={() => confirmFinalResult(draft)}
                />
              )
            )}

            {workflowStep === "done" && (
              <ThankYouStep
                game={completedState?.game ?? selectedGame}
                draft={completedState?.draft ?? draft}
              />
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function RefereeSelectStep({
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
  const selectableOptions = selectedReferee && selectedReferee !== noRefereeSelection && !options.includes(selectedReferee)
    ? [selectedReferee, ...options]
    : options;
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

function SetupPreviewStep({
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

function ManualResultTable({
  game,
  draft,
  onUpdate,
  onFocusSet,
  onBlurSet,
}: {
  game: Game;
  draft: GameDraft;
  onUpdate: <K extends keyof GameDraft>(key: K, value: GameDraft[K]) => void;
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

function ManualResultValidation({ validation }: { validation: { errors: string[]; valid: boolean } }) {
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

function ServerSelectionStep({
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

function SetupMiniHeader({ game, activeSet }: { game: Game; activeSet: 1 | 2 | 3 }) {
  return (
    <div className="setup-mini-header">
      <span className="setup-game-meta">{game.number ? `Spiel ${game.number}` : "Spiel"}{game.court ? ` · Court ${game.court}` : ""}</span>
      <strong className="setup-game-teams">{game.team_a || "Team A"} vs. {game.team_b || "Team B"}</strong>
      <span className="setup-set-label">Satz {activeSet}</span>
    </div>
  );
}

function LiveSetStep({
  game,
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
  onUndo,
  onToggleCorrection,
  onBack,
  onFinishSet,
  onSpecialRating,
}: {
  game: Game;
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
    <section className={correctionMode ? "live-set-card correcting" : "live-set-card"}>
      <div className="landscape-notice">Hoch- und Querformat werden unterstützt.</div>
      {completedSets.length > 0 && (
        <div className="live-set-results">
          {completedSets.map((row) => (
            <span key={row.label}>{row.label}: {setScoreForSide(row, leftTeam)}</span>
          ))}
        </div>
      )}
      <div className="live-set-title" aria-label={`Aktueller Satz ${activeSet}`}>Satz {activeSet}</div>
      {correctionMode && (
        <div className="correction-mode-banner">Korrekturmodus aktiv</div>
      )}
      {sideChangeBlocking && (
        <div className="side-change-modal-backdrop" role="presentation">
          <section className="side-change-dialog" role="dialog" aria-modal="true" aria-labelledby="side-change-title">
            <h3 id="side-change-title">Seitenwechsel</h3>
            <p>{setScore.A}:{setScore.B}</p>
            <button type="button" onClick={onSwapSides}>Seiten gewechselt</button>
          </section>
        </div>
      )}
      {activeTimeoutTeam && (
        <div className="timeout-overlay" aria-live="polite">
          <span>Auszeit {activeTimeoutTeamName}</span>
          <strong>{timeoutRemaining}s</strong>
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
          <button type="button" className="undo-point-button" onClick={onUndo} disabled={!canUndo || sideChangeBlocking} aria-label="Letzte Punkteingabe rückgängig">↶</button>
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
          {canFinishSet && (
            <button type="button" onClick={() => setConfirmFinishSet(true)}>
              Satz {activeSet} abschließen
            </button>
          )}
        </div>
      )}
      {confirmFinishSet && (
        <div className="modal-backdrop" role="presentation">
          <section className="finish-set-dialog" role="dialog" aria-modal="true" aria-labelledby="finish-set-title">
            <h3 id="finish-set-title">Satz {activeSet} abschließen?</h3>
            <p>{setScore.A}:{setScore.B}</p>
            <div className="finish-set-actions">
              <button type="button" className="secondary" onClick={() => setConfirmFinishSet(false)}>Abbrechen</button>
              <button type="button" onClick={() => { setConfirmFinishSet(false); onFinishSet(); }}>Satz abschließen</button>
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

function FinalReviewStep({
  game,
  draft,
  saving,
  onBack,
  onEdit,
  onConfirm,
}: {
  game: Game;
  draft: GameDraft;
  saving: boolean;
  onBack: () => void;
  onEdit: () => void;
  onConfirm: () => void;
}) {
  const rows = finalSetRows(draft);
  return (
    <section className="final-review-card">
      <div className="step-kicker">Spiel pruefen</div>
      <MatchHeading game={game} />
      <div className="final-score-board">
        <div></div>
        <strong>{game.team_a || "Team A"}</strong>
        <strong>{game.team_b || "Team B"}</strong>
        {rows.map((row) => (
          <React.Fragment key={row.label}>
            <span>{row.label}</span>
            <strong>{row.teamA || "-"}</strong>
            <strong>{row.teamB || "-"}</strong>
          </React.Fragment>
        ))}
      </div>
      <div className="final-result-panel">
        <div>
          <span>Saetze</span>
          <strong>{draft.result || "-"}</strong>
        </div>
        <div>
          <span>Siegerteam</span>
          <strong>{draft.winner_team || "nicht eindeutig"}</strong>
        </div>
        <div>
          <span>Wertung</span>
          <strong>{draft.game_rating || "Normal"}</strong>
        </div>
      </div>
      <div className="score-flow-actions">
        <button type="button" className="secondary" onClick={onBack}>Zurück</button>
        <button type="button" className="secondary" onClick={onEdit}>Bearbeiten</button>
        <button type="button" onClick={onConfirm} disabled={saving}>{saving ? "Speichert..." : `Sieger bestätigen: ${draft.winner_team || "-"}`}</button>
      </div>
    </section>
  );
}

function ThankYouStep({ game, draft }: { game: Game; draft: GameDraft }) {
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

function matchResult(draft: GameDraft) {
  const result = withScoreAutomation(draft).result ?? "";
  const match = result.match(/(\d+)\s*:\s*(\d+)/);
  return {
    teamA: match ? Number.parseInt(match[1], 10) : 0,
    teamB: match ? Number.parseInt(match[2], 10) : 0,
  };
}

function MatchHeading({ game, showTeams = true }: { game: Game; showTeams?: boolean }) {
  return (
    <div className="match-heading">
      <div className="match-meta-row">
        <span>Spiel Nr. {game.number || "-"}</span>
        <span>Court {game.court || "-"}</span>
      </div>
      {showTeams && <strong>{game.team_a} vs. {game.team_b}</strong>}
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

function completedWinnerSide(game: Game): TeamKey | "" {
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
  const result = game.result?.trim() || "";
  const match = result.match(/(\d+)\s*[:-]\s*(\d+)/);
  return {
    teamA: match?.[1] ?? "-",
    teamB: match?.[2] ?? "-",
  };
}

function setPointClass(game: Game, setNumber: 1 | 2 | 3, team: TeamKey) {
  const score = scoreForSet(draftFromGame(game), setNumber);
  if (score.A === score.B) {
    return "";
  }
  return score[team] > score[team === "A" ? "B" : "A"] ? "set-winner" : "";
}

function winnerIndexFromScores(game: Game) {
  const source = game.result || "";
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

function teamOptions(games: Game[]): string[] {
  const values = games.flatMap((game) => [game.team_a, game.team_b])
    .map((value) => (value ?? "").trim())
    .filter((value): value is string => Boolean(value) && value !== "(Freilos)");
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "de", { numeric: true }));
}

function playersForTeam(team: string | null, players?: string[]) {
  if (players && players.length >= 2) {
    return players.slice(0, 2);
  }
  const teamName = team || "Team";
  return [`${teamName} Spieler 1`, `${teamName} Spieler 2`];
}

function shortTeamLabel(value: string | null | undefined, fallback: string) {
  const label = value?.replace(/\s*\(\d+\)\s*$/, "").trim() || fallback;
  return label.replace(/\s+-\s+/g, " / ");
}

function scoreUrl(token: string, baseUrl?: string | null) {
  const url = new URL(baseUrl && baseUrl.trim() ? baseUrl.trim() : window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("token", token);
  return url.toString();
}

function formatSyncTime(date: Date) {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function scoreResumeKey(token: string) {
  return `courtboard.score-entry.${token}`;
}

function completedScoreEntryKey(token: string) {
  return `courtboard.score-entry.completed.${token}`;
}

function loadCompletedScoreEntry(token: string): CompletedScoreEntryState | null {
  try {
    const raw = window.localStorage.getItem(completedScoreEntryKey(token));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<CompletedScoreEntryState>;
    if (!parsed.game || !parsed.draft || !parsed.completedAt) {
      clearCompletedScoreEntry(token);
      return null;
    }

    const completedAt = Date.parse(parsed.completedAt);
    if (!Number.isFinite(completedAt) || Date.now() - completedAt > completedScoreEntryTtlMs) {
      clearCompletedScoreEntry(token);
      return null;
    }

    return {
      game: parsed.game,
      draft: parsed.draft,
      completedAt: parsed.completedAt,
    };
  } catch {
    clearCompletedScoreEntry(token);
    return null;
  }
}

function saveCompletedScoreEntry(token: string, state: CompletedScoreEntryState) {
  try {
    window.localStorage.setItem(completedScoreEntryKey(token), JSON.stringify(state));
  } catch {
    // Ignore storage failures; the submitted result is already persisted through the API.
  }
}

function clearCompletedScoreEntry(token: string) {
  try {
    window.localStorage.removeItem(completedScoreEntryKey(token));
  } catch {
    // Ignore storage failures.
  }
}

function loadScoreEntryResume(token: string): ScoreEntryResumeState | null {
  try {
    const raw = window.localStorage.getItem(scoreResumeKey(token));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<ScoreEntryResumeState> & { workflowStep?: unknown };
    if (!parsed.gameId || !parsed.draft || !isResumableWorkflowStep(parsed.workflowStep)) {
      return null;
    }
    return {
      gameId: parsed.gameId,
      draft: parsed.draft,
      workflowStep: parsed.workflowStep,
      serverSetupStep: isServerSetupStep(parsed.serverSetupStep) ? parsed.serverSetupStep : "serve-team",
      activeSet: isSetNumber(parsed.activeSet) ? parsed.activeSet : 1,
      servingTeam: isTeamKey(parsed.servingTeam) ? parsed.servingTeam : "",
      firstServerTeamA: parsed.firstServerTeamA ?? "",
      firstServerTeamB: parsed.firstServerTeamB ?? "",
      captainTeamA: parsed.captainTeamA ?? "",
      captainTeamB: parsed.captainTeamB ?? "",
      sideChangeInterval: parsed.sideChangeInterval === 5 || parsed.sideChangeInterval === 7 ? parsed.sideChangeInterval : null,
      leftTeam: isTeamKey(parsed.leftTeam) ? parsed.leftTeam : "A",
      setScore: normalizeTeamNumberRecord(parsed.setScore),
      serverIndex: normalizeTeamNumberRecord(parsed.serverIndex),
      serveCounts: normalizeTeamNumberRecord(parsed.serveCounts),
      correctionMode: Boolean(parsed.correctionMode),
      sideChangeAck: typeof parsed.sideChangeAck === "number" ? parsed.sideChangeAck : null,
      timeoutScore: normalizeTeamStringRecord(parsed.timeoutScore),
      activeTimeoutTeam: isTeamKey(parsed.activeTimeoutTeam) ? parsed.activeTimeoutTeam : null,
      timeoutRemaining: typeof parsed.timeoutRemaining === "number" ? Math.max(0, Math.min(30, parsed.timeoutRemaining)) : 0,
    };
  } catch {
    return null;
  }
}

function saveScoreEntryResume(token: string, state: ScoreEntryResumeState) {
  try {
    window.localStorage.setItem(scoreResumeKey(token), JSON.stringify(state));
  } catch {
    // Ignore storage failures; live scoring still persists through the API.
  }
}

function clearScoreEntryResume(token: string) {
  try {
    window.localStorage.removeItem(scoreResumeKey(token));
  } catch {
    // Ignore storage failures.
  }
}

function isTeamKey(value: unknown): value is TeamKey {
  return value === "A" || value === "B";
}

function isSetNumber(value: unknown): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3;
}

function isServerSetupStep(value: unknown): value is ServerSetupStep {
  return value === "captain-a" || value === "captain-b" || value === "serve-team" || value === "team-a" || value === "team-b" || value === "side-change";
}

function isResumableWorkflowStep(value: unknown): value is Exclude<ScoreWorkflowStep, "done"> {
  return value === "confirm" || value === "preview" || value === "servers" || value === "setup-preview" || value === "live" || value === "scoring";
}

function normalizeTeamNumberRecord(value: unknown): Record<TeamKey, number> {
  const record = value && typeof value === "object" ? value as Partial<Record<TeamKey, unknown>> : {};
  return {
    A: typeof record.A === "number" ? record.A : 0,
    B: typeof record.B === "number" ? record.B : 0,
  };
}

function normalizeTeamStringRecord(value: unknown): Record<TeamKey, string | null> {
  const record = value && typeof value === "object" ? value as Partial<Record<TeamKey, unknown>> : {};
  return {
    A: typeof record.A === "string" ? record.A : null,
    B: typeof record.B === "string" ? record.B : null,
  };
}
