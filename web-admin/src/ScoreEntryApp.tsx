import React, { FormEvent, useEffect, useRef, useState } from "react";
import { gameRatingOptions } from "./appConfig";
import { loadScoreEntry, submitScore } from "./dataApi";
import { draftFromGame, draftWithSetScore, hasTwoSetLeadAfterSecondSet, isPlausibleSetResult, parsePointHistory, parseTimeoutHistory, scoreForSet, serializePointHistory, validateManualResult, withScoreAutomation } from "./scoreLogic";
import { clearCompletedScoreEntry, clearScoreEntryResume, type CompletedScoreEntryState, loadCompletedScoreEntry, loadScoreEntryResume, saveCompletedScoreEntry, saveScoreEntryResume } from "./scoreEntryStorage";
import { FinalReviewStep, LiveSetStep, LockedScoreEntry, ManualResultTable, ManualResultValidation, RefereeSelectStep, ScoreContextBox, ServerSelectionStep, SetupPreviewStep, ThankYouStep } from "./scoreEntrySteps";
import type { Game, GameDraft, ScoreEntryData } from "./types";
import type { LiveSnapshot, ScoreEntryResumeState, ScoreWorkflowStep, ServerSetupStep, TeamKey } from "./workflowTypes";

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
  const sideSwapTimeouts = useRef<number[]>([]);

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
    return () => {
      sideSwapTimeouts.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      sideSwapTimeouts.current = [];
    };
  }, []);

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
    cancelPendingSideSwap();
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

  function currentLiveSnapshot(nextDraft: GameDraft): LiveSnapshot {
    return {
      draft: nextDraft,
      leftTeam,
      setScore,
      servingTeam,
      serverIndex,
      serveCounts,
      sideChangeAck,
    };
  }

  function changeSetPoint(team: TeamKey, delta: 1 | -1) {
    if (!draft || isSwappingSides) {
      return;
    }
    setPointHistory((current) => [...current, currentLiveSnapshot(draft)]);

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
    cancelPendingSideSwap();
    const previous = pointHistory[pointHistory.length - 1];
    if (!previous) {
      return;
    }
    const shouldAnimateSideUndo = previous.leftTeam !== leftTeam;
    setPointHistory((current) => current.slice(0, -1));
    setDraft(previous.draft);
    setSetScore(previous.setScore);
    setServingTeam(previous.servingTeam);
    setServerIndex(previous.serverIndex);
    setServeCounts(previous.serveCounts);
    setLastPointTeam(null);
    if (shouldAnimateSideUndo) {
      setIsSwappingSides(true);
      const switchTimeout = window.setTimeout(() => {
        setLeftTeam(previous.leftTeam);
        setSideChangeAck(previous.sideChangeAck);
      }, 1260);
      const doneTimeout = window.setTimeout(() => {
        setIsSwappingSides(false);
        sideSwapTimeouts.current = [];
      }, 1300);
      sideSwapTimeouts.current = [switchTimeout, doneTimeout];
    } else {
      setLeftTeam(previous.leftTeam);
      setSideChangeAck(previous.sideChangeAck);
    }
    void persistLiveDraft(previous.draft);
  }

  function swapSides() {
    if (!draft || isSwappingSides) {
      return;
    }
    cancelPendingSideSwap();
    const totalPoints = setScore.A + setScore.B;
    setIsSwappingSides(true);
    const switchTimeout = window.setTimeout(() => {
      setLeftTeam((current) => current === "A" ? "B" : "A");
      setSideChangeAck(totalPoints);
    }, 1260);
    const doneTimeout = window.setTimeout(() => {
      setIsSwappingSides(false);
      sideSwapTimeouts.current = [];
    }, 1300);
    sideSwapTimeouts.current = [switchTimeout, doneTimeout];
  }

  function cancelPendingSideSwap() {
    sideSwapTimeouts.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    sideSwapTimeouts.current = [];
    setIsSwappingSides(false);
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

  function endTimeout() {
    setActiveTimeoutTeam(null);
    setTimeoutRemaining(0);
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
      <section className={workflowStep === "scoring" && !finalEditing ? "score-panel final-review-mode" : "score-panel"}>
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
                onEndTimeout={endTimeout}
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

function matchResult(draft: GameDraft) {
  const result = withScoreAutomation(draft).result ?? "";
  const match = result.match(/(\d+)\s*:\s*(\d+)/);
  return {
    teamA: match ? Number.parseInt(match[1], 10) : 0,
    teamB: match ? Number.parseInt(match[2], 10) : 0,
  };
}
