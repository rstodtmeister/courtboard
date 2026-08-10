export type ScoreSubmissionInput = {
  referee?: unknown;
  gameRating?: unknown;
  set1TeamA?: unknown;
  set1TeamB?: unknown;
  set2TeamA?: unknown;
  set2TeamB?: unknown;
  set3TeamA?: unknown;
  set3TeamB?: unknown;
  completed?: unknown;
  pointHistory?: unknown;
};

export type ScoreValidationGame = {
  team_a: string | null;
  team_b: string | null;
};

export class ScoreValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScoreValidationError";
  }
}

const gameRatings = new Set([
  "Normal",
  "Freilos B",
  "Freilos A",
  "Verletzung A",
  "Verletzung B",
  "Verletzung A + B",
  "Aufgabe A",
  "Aufgabe B",
  "Aufgabe A + B",
  "nicht angetreten A",
  "nicht angetreten B",
  "nicht angetreten A + B",
  "Verletzung A + Nichtangetreten B",
  "Nichtangetreten A + Verletzung B",
]);

export function validateScoreSubmission(input: ScoreSubmissionInput, game: ScoreValidationGame) {
  const referee = boundedString(input.referee, "Schiedsrichter", 160);
  const gameRating = boundedString(input.gameRating, "Spielwertung", 80) || "Normal";
  if (!gameRatings.has(gameRating)) {
    throw new ScoreValidationError("Unbekannte Spielwertung.");
  }
  if (input.completed !== undefined && typeof input.completed !== "boolean") {
    throw new ScoreValidationError("completed muss ein boolescher Wert sein.");
  }

  const completed = input.completed === true;
  const setScores = [
    [score(input.set1TeamA, "Satz 1 Team A"), score(input.set1TeamB, "Satz 1 Team B")],
    [score(input.set2TeamA, "Satz 2 Team A"), score(input.set2TeamB, "Satz 2 Team B")],
    [score(input.set3TeamA, "Satz 3 Team A"), score(input.set3TeamB, "Satz 3 Team B")],
  ] as const;
  const pointHistory = validatedPointHistory(input.pointHistory);
  const normalRating = gameRating === "Normal";
  const result = evaluateSets(setScores, completed && normalRating);
  const winnerTeam = normalRating
    ? winnerFromSets(result.teamAWins, result.teamBWins, game)
    : winnerFromSpecialRating(gameRating, game);

  return {
    referee,
    gameRating,
    set1TeamA: setScores[0][0],
    set1TeamB: setScores[0][1],
    set2TeamA: setScores[1][0],
    set2TeamB: setScores[1][1],
    set3TeamA: setScores[2][0],
    set3TeamB: setScores[2][1],
    completed,
    pointHistory,
    result: result.validSetCount > 0 ? `${result.teamAWins}:${result.teamBWins}` : "",
    winnerTeam,
  };
}

function boundedString(value: unknown, label: string, maxLength: number) {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value !== "string") {
    throw new ScoreValidationError(`${label} muss Text sein.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new ScoreValidationError(`${label} ist zu lang.`);
  }
  return normalized;
}

function score(value: unknown, label: string) {
  const normalized = boundedString(value, label, 3);
  if (!normalized) {
    return "";
  }
  if (!/^\d{1,2}$/.test(normalized)) {
    throw new ScoreValidationError(`${label} muss eine Zahl zwischen 0 und 99 sein.`);
  }
  return String(Number.parseInt(normalized, 10));
}

function evaluateSets(scores: readonly (readonly [string, string])[], requireCompletedResult: boolean) {
  let teamAWins = 0;
  let teamBWins = 0;
  let validSetCount = 0;
  let previousSetMissing = false;
  let matchDecided = false;

  for (let index = 0; index < scores.length; index++) {
    const [rawA, rawB] = scores[index];
    const hasA = rawA !== "";
    const hasB = rawB !== "";
    if (!hasA && !hasB) {
      previousSetMissing = true;
      continue;
    }
    if (hasA !== hasB) {
      throw new ScoreValidationError(`Satz ${index + 1} ist unvollständig.`);
    }
    if (previousSetMissing) {
      throw new ScoreValidationError(`Vor Satz ${index + 1} fehlt ein Satz.`);
    }
    const scoreA = Number.parseInt(rawA, 10);
    const scoreB = Number.parseInt(rawB, 10);
    if (!isValidSetResult(scoreA, scoreB)) {
      if (requireCompletedResult) {
        throw new ScoreValidationError(`Satz ${index + 1} hat kein gültiges Endergebnis.`);
      }
      continue;
    }
    if (matchDecided) {
      throw new ScoreValidationError("Satz 3 darf nach einem 2:0 nicht eingetragen werden.");
    }
    if (scoreA > scoreB) {
      teamAWins++;
    } else {
      teamBWins++;
    }
    validSetCount++;
    matchDecided = teamAWins >= 2 || teamBWins >= 2;
  }

  if (requireCompletedResult && !(validSetCount === 1 || matchDecided)) {
    throw new ScoreValidationError("Für den Spielabschluss fehlt ein vollständiges Ergebnis.");
  }
  return { teamAWins, teamBWins, validSetCount };
}

function isValidSetResult(scoreA: number, scoreB: number) {
  const winnerPoints = Math.max(scoreA, scoreB);
  const difference = Math.abs(scoreA - scoreB);
  return winnerPoints >= 15 && difference >= 2
    && (winnerPoints === 15 || winnerPoints === 21 || difference === 2);
}

function winnerFromSets(teamAWins: number, teamBWins: number, game: ScoreValidationGame) {
  if (teamAWins === teamBWins) {
    return "";
  }
  return teamAWins > teamBWins ? game.team_a || "1" : game.team_b || "2";
}

function winnerFromSpecialRating(rating: string, game: ScoreValidationGame) {
  const normalized = rating.toLocaleLowerCase("de-DE");
  const teamAFailed = normalized.includes("freilos a")
    || normalized.includes("verletzung a")
    || normalized.includes("aufgabe a")
    || normalized.includes("angetreten a");
  const teamBFailed = normalized.includes("freilos b")
    || normalized.includes("verletzung b")
    || normalized.includes("aufgabe b")
    || normalized.includes("angetreten b");
  if (teamAFailed === teamBFailed) {
    return "";
  }
  return teamAFailed ? game.team_b || "2" : game.team_a || "1";
}

function validatedPointHistory(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string" || value.length > 30_000) {
    throw new ScoreValidationError("Der Punkteverlauf ist ungültig oder zu groß.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ScoreValidationError("Der Punkteverlauf ist kein gültiges JSON.");
  }
  if (!Array.isArray(parsed) || parsed.length > 120 || !parsed.every(validHistoryEntry)) {
    throw new ScoreValidationError("Der Punkteverlauf enthält ungültige Einträge.");
  }
  return JSON.stringify(parsed);
}

function validHistoryEntry(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const entry = value as Record<string, unknown>;
  const commonFieldsValid = (entry.set === 1 || entry.set === 2 || entry.set === 3)
    && (entry.team === "A" || entry.team === "B")
    && validHistoryScore(entry.scoreA)
    && validHistoryScore(entry.scoreB);
  if (!commonFieldsValid) {
    return false;
  }
  return entry.type === undefined
    || (entry.type === "timeout" && typeof entry.startedAt === "string" && entry.startedAt.length <= 64);
}

function validHistoryScore(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 99;
}
