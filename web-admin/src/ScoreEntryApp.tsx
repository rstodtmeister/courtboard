import { resumeForGame, serializeScoreSession } from "./scoreSession";
import { ScoreWriterGuard } from "./ScoreWriterGuard";
import { isRevisionConflictMessage } from "./scoreOutbox";
import { ScoreSyncStatus } from "./ScoreSyncStatus";
import { HvvDeliveryStatus } from "./HvvDeliveryStatus";
import React, { FormEvent, useEffect, useRef, useState } from "react";
import { gameRatingOptions } from "./appConfig";
import { dataMode, scoreOutbox, heartbeatScoreEntry, loadScoreEntry, submitScore } from "./dataApi";
import { canAcceptPointInput, draftFromGame, draftWithSetScore, hasTwoSetLeadAfterSecondSet, isPlausibleSetResult, parsePointHistory, parseTimeoutHistory, rebuildUndoHistory, scoreForSet, serializePointHistory, validateManualResult, withScoreAutomation } from "./scoreLogic";
import { clearCompletedScoreEntry, clearScoreEntryResume, type CompletedScoreEntryState, loadCompletedScoreEntry, loadScoreEntryResume, saveCompletedScoreEntry, saveScoreEntryResume } from "./scoreEntryStorage";
import { FinalReviewStep, LiveSetStep, LockedScoreEntry, ManualResultTable, ManualResultValidation, PlayerLabelsStep, RefereeSelectStep, ScoreContextBox, ServerSelectionStep, SetupPreviewStep, ThankYouStep } from "./scoreEntrySteps";
import { duplicatePlayersForTeam, numberedDuplicatePlayers, playersForTeam } from "./scoreEntryHelpers";
import type { Game, GameDraft, ScoreEntryData } from "./types";
import type { LiveSnapshot, ScoreEntryResumeState, ScoreWorkflowStep, ServerSetupStep, TeamKey } from "./workflowTypes";

export function ScoreEntryApp({ token }: { token: string }) {
  return <ScoreWriterGuard><ScoreEntryContent token={token} /></ScoreWriterGuard>;
}

function ScoreEntryContent({ token }: { token: string }) {
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
  const [playerLabels, setPlayerLabels] = useState<Record<TeamKey, [string, string] | null>>({ A: null, B: null });
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
  const [timeoutEndsAt, setTimeoutEndsAt] = useState<number | null>(null);
  const lastSessionSave = useRef("");
  const [error, setError] = useState("");
  const [lockedMessage, setLockedMessage] = useState("");
  const [liveError, setLiveError] = useState("");
  const [message, setMessage] = useState("");
  const sideSwapTimeouts = useRef<number[]>([]);
  const latestLiveSave = useRef(0);
  const finishingSet = useRef(false);
  const lastPointInputAt = useRef<number | null>(null);
  const [syncVersion, setSyncVersion] = useState(0);
  useEffect(() => scoreOutbox.subscribe(() => setSyncVersion((value) => value+1)), []);
  const syncStatus = dataMode === "supabase" ? scoreOutbox.status(selectedGameId) : null;
  const syncBlocked = Boolean(syncStatus?.blocked || syncStatus?.completing);
  useEffect(() => {
    if (dataMode !== "supabase" || !selectedGameId || syncStatus?.pending) return;
    const confirmed = scoreOutbox.latest(selectedGameId);
    const game = data?.games.find((item) => item.id === selectedGameId);
    if (!confirmed?.completed || !game) return;
    const state = { game: { ...game, ...confirmed }, draft: confirmed, completedAt: new Date().toISOString() };
    saveCompletedScoreEntry(token, state); clearScoreEntryResume(token);
    setCompletedState(state); setDraft(confirmed); setWorkflowStep("done"); setSaving(false);
  }, [syncVersion, selectedGameId]);


  useEffect(() => {
    return () => { latestLiveSave.current += 1; };
  }, [token, selectedGameId]);

  async function loadEntry() {
    setLoading(true);
    setResumeReady(false);
    lastSessionSave.current = "";
    setError("");
    setLockedMessage("");

    try {
      const entryData = await loadScoreEntry(token);
      const savedCompletedState = loadCompletedScoreEntry(token);
      const stillShowsCompletedGame = savedCompletedState
        && (entryData.games.length === 0 || entryData.games.some((game) => game.id === savedCompletedState.game.id));
      if (savedCompletedState && stillShowsCompletedGame) {
        setSelectedGameId(savedCompletedState.game.id);
        setDraft(savedCompletedState.draft);
        setData(entryData.games.length > 0 ? entryData : { ...entryData, games: [savedCompletedState.game] });
        setCompletedState(savedCompletedState);
        setWorkflowStep("done");
        return;
      }

      if (savedCompletedState) {
        clearCompletedScoreEntry(token);
      }
      setCompletedState(null);
      setResumeState(null);
      setWorkflowStep("confirm");
      setData(entryData);
      const firstGame = entryData.games[0];
      if (firstGame) {
        setSelectedGameId(firstGame.id);
        setDraft(draftFromGame(firstGame));
      } else {
        setSelectedGameId("");
        setDraft(null);
      }
      if (firstGame) {
        setResumeState(resumeForGame(firstGame,
          dataMode === "supabase" ? scoreOutbox.latest(firstGame.id) : null,
          loadScoreEntryResume(token)));
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
  const scoringGame = selectedGame ? {
    ...selectedGame,
    team_a_players: playerLabels.A ?? playersForTeam(selectedGame.team_a, selectedGame.team_a_players),
    team_b_players: playerLabels.B ?? playersForTeam(selectedGame.team_b, selectedGame.team_b_players),
  } : null;

  useEffect(() => {
    if (!selectedGameId || workflowStep === "done" || completedState) {
      return;
    }
    let stopped = false;
    const heartbeat = async () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      try {
        await heartbeatScoreEntry(token, selectedGameId);
      } catch (heartbeatError) {
        if (stopped) return;
        const text = heartbeatError instanceof Error ? heartbeatError.message : "Court-Sperre konnte nicht verlaengert werden.";
        if (text.includes("anderen Geraet") || text.includes("bereits")) setLockedMessage(text);
        else setLiveError(text);
      }
    };
    const interval = window.setInterval(heartbeat, 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") void heartbeat(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token, selectedGameId, workflowStep, completedState]);

  useEffect(() => {
    if (!activeTimeoutTeam || timeoutEndsAt === null) return;
    const tick = () => {
      const remaining = Math.max(0, Math.min(30, Math.ceil((timeoutEndsAt - Date.now()) / 1000)));
      setTimeoutRemaining(remaining);
      if (remaining === 0) {
        setActiveTimeoutTeam(null);
        setTimeoutEndsAt(null);
      }
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [activeTimeoutTeam, timeoutEndsAt]);

  useEffect(() => {
    return () => {
      sideSwapTimeouts.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      sideSwapTimeouts.current = [];
    };
  }, []);

  useEffect(() => {
    if (!resumeReady || loading || lockedMessage || !selectedGameId || !draft || draft.completed || workflowStep === "confirm" || workflowStep === "done") {
      return;
    }
    const state: ScoreEntryResumeState = {
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
      playerLabels,
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
      timeoutEndsAt,
      finalEditing,
      pointHistory,
    };
    saveScoreEntryResume(token, state);
    setResumeState(state);
    // Manual result fields can be incomplete while typing; only submit those on confirmation.
    if (finalEditing) return;
    try {
      const snapshot = { ...draft, score_entry_state: serializeScoreSession(state) };
      const key = JSON.stringify(snapshot);
      if (lastSessionSave.current === key) return;
      lastSessionSave.current = key;
      void persistLiveDraft(snapshot).then(saved => {
        if (!saved && lastSessionSave.current === key) lastSessionSave.current = "";
      });
    } catch (saveError) {
      setLiveError(saveError instanceof Error ? saveError.message : "Erfassungszustand konnte nicht gespeichert werden.");
    }
  }, [
    resumeReady,
    loading,
    lockedMessage,
    finalEditing,
    timeoutEndsAt,
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
    playerLabels,
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
    pointHistory,
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
    setResumeState(nextGame ? resumeForGame(nextGame,
      dataMode === "supabase" ? scoreOutbox.latest(nextGame.id) : null, loadScoreEntryResume(token)) : null);
    lastSessionSave.current = "";
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
    setPlayerLabels({ A: null, B: null });
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
    setTimeoutEndsAt(null);
    setMessage("");
    setError("");
    setLiveError("");
  }

  function resumeLastEntry(state = resumeState) {
    if (!state) {
      return;
    }
    setSelectedGameId(state.gameId);
    setDraft(state.draft);
    setWorkflowStep(state.workflowStep);
    setServerSetupStep(state.serverSetupStep);
    setFinalEditing(state.finalEditing ?? false);
    setActiveSet(state.activeSet);
    setServingTeam(state.servingTeam);
    setFirstServerTeamA(state.firstServerTeamA);
    setFirstServerTeamB(state.firstServerTeamB);
    setCaptainTeamA(state.captainTeamA);
    setCaptainTeamB(state.captainTeamB);
    setPlayerLabels(state.playerLabels ?? { A: null, B: null });
    setSideChangeInterval(state.sideChangeInterval);
    setLeftTeam(state.leftTeam);
    setSetScore(state.setScore);
    setServerIndex(state.serverIndex);
    setServeCounts(state.serveCounts);
    setPointHistory(state.draft.score_entry_state || state.pointHistory.length > 0 ? state.pointHistory : rebuildUndoHistory(state));
    setCorrectionMode(state.correctionMode);
    setLastPointTeam(null);
    setSideChangeAck(state.sideChangeAck);
    setIsSwappingSides(false);
    setTimeoutScore(state.timeoutScore);
    setActiveTimeoutTeam(state.activeTimeoutTeam);
    setTimeoutRemaining(state.timeoutRemaining);
    setTimeoutEndsAt(state.timeoutEndsAt ?? (state.activeTimeoutTeam ? Date.now() + state.timeoutRemaining * 1000 : null));
    setMessage("");
    setError("");
    setLiveError("");
  }

  function applyServerEntry(entry: ScoreEntryData) {
    const game = entry.games.find(item => item.id === selectedGameId);
    if (!game) return;
    const nextDraft = draftFromGame(game);
    const restored = resumeForGame(game, nextDraft, null);
    scoreOutbox.adoptServer(game.id, game, entry, nextDraft);
    latestLiveSave.current += 1;
    cancelPendingSideSwap();
    clearScoreEntryResume(token); clearCompletedScoreEntry(token);
    setData(entry); setDraft(nextDraft); setCompletedState(null); setResumeState(restored);
    setSaving(false); setError(""); setLiveError(""); setMessage("");
    lastSessionSave.current = "";
    if (game.completed) {
      const completed = { game, draft: nextDraft, completedAt: new Date().toISOString() };
      saveCompletedScoreEntry(token, completed); setCompletedState(completed); setWorkflowStep("done");
    } else if (restored) {
      resumeLastEntry(restored);
    } else {
      setWorkflowStep("confirm"); setFinalEditing(false);
      setActiveTimeoutTeam(null); setTimeoutEndsAt(null); setTimeoutRemaining(0);
    }
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
    const savedEntry = resumeState?.gameId === selectedGame.id ? resumeState : null;
    const nextDraft = { ...(savedEntry?.draft ?? draft), referee,
      score_entry_state: savedEntry && referee ? serializeScoreSession(savedEntry) : null };
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
      if (savedEntry) {
        resumeLastEntry({ ...savedEntry, draft: nextDraft });
      } else {
        const duplicateA = duplicatePlayersForTeam(selectedGame.team_a, selectedGame.team_a_players);
        const duplicateB = duplicatePlayersForTeam(selectedGame.team_b, selectedGame.team_b_players);
        if (duplicateA || duplicateB) {
          setPlayerLabels({ A: duplicateA ? numberedDuplicatePlayers(duplicateA) : null, B: duplicateB ? numberedDuplicatePlayers(duplicateB) : null });
          setWorkflowStep("players");
        } else {
          setWorkflowStep("servers");
        }
      }
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
    lastPointInputAt.current = null;
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
    setTimeoutEndsAt(null);
    setDraft(current => current && !current.match_started_at ? { ...current,
      match_started_at: new Date().toISOString(), match_video_id: selectedGame?.configured_video_id ?? null } : current);
    setWorkflowStep("live");
  }

  async function persistLiveDraft(nextDraft: GameDraft) {
    if (!selectedGame) {
      return false;
    }
    const saveNumber = ++latestLiveSave.current;
    setLiveError("");
    try {
      await submitScore(token, selectedGame, nextDraft);
      if (saveNumber === latestLiveSave.current) setLiveError("");
      return true;
    } catch (submitError) {
      if (saveNumber === latestLiveSave.current) {
        setLiveError(submitError instanceof Error ? submitError.message : "Live-Stand konnte nicht gespeichert werden.");
      }
      return false;
    }
  }

  function currentLiveSnapshot(nextDraft: GameDraft): LiveSnapshot {
    return {
      draft: { ...nextDraft, score_entry_state: null },
      leftTeam,
      setScore,
      servingTeam,
      serverIndex,
      serveCounts,
      sideChangeAck,
    };
  }

  function changeSetPoint(team: TeamKey, delta: 1 | -1) {
    if (!draft || isSwappingSides || finishingSet.current || syncBlocked) {
      return;
    }
    if (delta > 0 && !correctionMode) {
      const now = performance.now();
      if (!canAcceptPointInput(lastPointInputAt.current, now)) {
        return;
      }
      lastPointInputAt.current = now;
    }
    setPointHistory((current) => [...current, currentLiveSnapshot(draft)].slice(-120));

    const nextScore = { ...setScore, [team]: Math.max(0, setScore[team] + delta) };
    const baseDraft = draftWithSetScore(draft, activeSet, nextScore);
    const nextDraft = withScoreAutomation({
      ...baseDraft,
      point_history: delta > 0
        ? serializePointHistory([
          ...parsePointHistory(draft.point_history),
          ...parseTimeoutHistory(draft.point_history),
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
  }

  function undoLastPoint() {
    if (finishingSet.current) return;
    cancelPendingSideSwap();
    const previous = pointHistory[pointHistory.length - 1];
    if (!previous) {
      return;
    }
    lastPointInputAt.current = null;
    const previousTotalPoints = previous.setScore.A + previous.setScore.B;
    const restoredSideChangeAck = previous.sideChangeAck
      ?? (sideChangeInterval && previousTotalPoints > 0 && previousTotalPoints % sideChangeInterval === 0
        ? previousTotalPoints
        : null);
    const shouldAnimateSideUndo = previous.leftTeam !== leftTeam;
    setPointHistory((current) => current.slice(0, -1));
    setDraft(previous.draft);
    setSetScore(previous.setScore);
    setServingTeam(previous.servingTeam);
    setServerIndex(previous.serverIndex);
    setServeCounts(previous.serveCounts);
    setLastPointTeam(null);
    setSideChangeAck(restoredSideChangeAck);
    if (shouldAnimateSideUndo) {
      setIsSwappingSides(true);
      const switchTimeout = window.setTimeout(() => {
        setLeftTeam(previous.leftTeam);
      }, 1260);
      const doneTimeout = window.setTimeout(() => {
        setIsSwappingSides(false);
        sideSwapTimeouts.current = [];
      }, 1300);
      sideSwapTimeouts.current = [switchTimeout, doneTimeout];
    } else {
      setLeftTeam(previous.leftTeam);
    }
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
    if (!draft || timeoutScore[team] || finishingSet.current) {
      return;
    }
    setTimeoutScore((current) => ({ ...current, [team]: `${setScore[team]}:${setScore[team === "A" ? "B" : "A"]}` }));
    setActiveTimeoutTeam(team);
    setTimeoutRemaining(30);
    setTimeoutEndsAt(Date.now() + 30_000);
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
  }

  function endTimeout() {
    setActiveTimeoutTeam(null);
    setTimeoutRemaining(0);
    setTimeoutEndsAt(null);
  }

  async function finishCurrentSet() {
    if (!draft || finishingSet.current) {
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
    finishingSet.current = true;
    setSaving(true);
    try {
      setLiveError("");
      const nextDraft = withScoreAutomation(draftWithSetScore(draft, activeSet, setScore));
      setDraft(nextDraft);

      const result = matchResult(nextDraft);
      if (result.teamA >= 2 || result.teamB >= 2 || activeSet === 3) {
        setDraft({ ...nextDraft, match_ended_at: nextDraft.match_started_at ? new Date().toISOString() : null });
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
      setTimeoutEndsAt(null);
      setWorkflowStep("servers");
    } finally {
      finishingSet.current = false;
      setSaving(false);
    }
  }

  async function finishWithSpecialRating(rating: string) {
    if (!draft || finishingSet.current) {
      return;
    }
    finishingSet.current = true;
    setSaving(true);
    try {
      const nextDraft = withScoreAutomation({
        ...draftWithSetScore(draft, activeSet, setScore),
        game_rating: rating,
        completed: false,
      });
      setDraft(nextDraft);

      setFinalEditing(false);
      setWorkflowStep("scoring");
    } finally {
      finishingSet.current = false;
      setSaving(false);
    }
  }

  async function confirmFinalResult(nextDraft: GameDraft | null = draft) {
    if (!nextDraft || !selectedGame) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const completedDraft = { ...nextDraft, match_ended_at: nextDraft.match_started_at ? (nextDraft.match_ended_at ?? new Date().toISOString()) : null, score_entry_state: null, completed: true, game_rating: nextDraft.game_rating || "Normal" };
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
        {error && !isRevisionConflictMessage(error) && <div className="error">{error}</div>}
        {message && <div className="success">{message}</div>}
        {completedState && <HvvDeliveryStatus token={token} gameId={completedState.game.id} />}
        {!loading && !lockedMessage && selectedGame && draft && (
          <div className="score-form" inert={syncBlocked}>
            {data && data.games.length > 1 && (
              <label>
                Spiel
                <select value={selectedGameId} onChange={(event) => selectGame(event.target.value)} disabled={saving}>
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
                onResume={() => resumeLastEntry()}
              />
            )}

            {workflowStep === "players" && scoringGame && (
              <PlayerLabelsStep
                game={selectedGame}
                labels={playerLabels}
                onChange={(team, index, value) => setPlayerLabels(current => {
                  const next = current[team] ? [...current[team]!] as [string, string] : ["", ""] as [string, string];
                  next[index] = value;
                  return { ...current, [team]: next };
                })}
                onBack={() => setWorkflowStep("confirm")}
                onContinue={() => {
                  setPlayerLabels(current => ({
                    A: current.A ? current.A.map(value => value.trim()) as [string, string] : null,
                    B: current.B ? current.B.map(value => value.trim()) as [string, string] : null,
                  }));
                  setWorkflowStep("servers");
                }}
              />
            )}

            {(workflowStep === "servers" || workflowStep === "preview") && scoringGame && (
              <ServerSelectionStep
                key={`${selectedGame.id}-${activeSet}`}
                game={scoringGame}
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
                onContinue={startCurrentSet}
              />
            )}

            {workflowStep === "setup-preview" && (
              <SetupPreviewStep
                game={scoringGame ?? selectedGame}
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

            {workflowStep === "live" && saving && <div className="status" role="status">Satz wird gespeichert...</div>}
            {workflowStep === "live" && (
              <LiveSetStep
                saving={saving}
                game={scoringGame ?? selectedGame}
                draft={draft}
                leftTeam={leftTeam}
                setScore={setScore}
                servingTeam={servingTeam || "A"}
                serverIndex={serverIndex}
                liveError={isRevisionConflictMessage(liveError) ? "" : liveError}
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
        <ScoreSyncStatus gameId={selectedGameId} onResolved={applyServerEntry} />
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
