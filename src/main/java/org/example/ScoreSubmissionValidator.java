package org.example;

import java.util.Set;

final class ScoreSubmissionValidator {
    private static final Set<String> GAME_RATINGS = Set.of(
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
            "Nichtangetreten A + Verletzung B");

    private ScoreSubmissionValidator() {
    }

    static void validateAndApply(GameState game, String body) {
        String referee = bounded(LocalApiJson.jsonField(body, "referee"), "Schiedsrichter", 160);
        String rating = bounded(LocalApiJson.jsonField(body, "gameRating"), "Spielwertung", 80);
        if (rating.isBlank()) {
            rating = "Normal";
        }
        if (!GAME_RATINGS.contains(rating)) {
            throw new IllegalArgumentException("Unbekannte Spielwertung.");
        }

        String[][] scores = {
                {score(body, "set1TeamA", "Satz 1 Team A"), score(body, "set1TeamB", "Satz 1 Team B")},
                {score(body, "set2TeamA", "Satz 2 Team A"), score(body, "set2TeamB", "Satz 2 Team B")},
                {score(body, "set3TeamA", "Satz 3 Team A"), score(body, "set3TeamB", "Satz 3 Team B")}
        };
        boolean completed = "true".equals(LocalApiJson.jsonField(body, "completed"));
        SetResult result = evaluateSets(scores, completed && "Normal".equals(rating));
        String pointHistory = LocalApiJson.jsonField(body, "pointHistory");
        if (pointHistory.length() > 30_000 || (!pointHistory.isBlank() && !(pointHistory.startsWith("[") && pointHistory.endsWith("]")))) {
            throw new IllegalArgumentException("Der Punkteverlauf ist ungültig oder zu groß.");
        }

        game.referee = referee;
        game.gameRating = rating;
        game.set1TeamA = scores[0][0];
        game.set1TeamB = scores[0][1];
        game.set2TeamA = scores[1][0];
        game.set2TeamB = scores[1][1];
        game.set3TeamA = scores[2][0];
        game.set3TeamB = scores[2][1];
        game.pointHistory = pointHistory;
        game.result = result.validSets > 0 ? result.teamAWins + ":" + result.teamBWins : "";
        game.winnerTeam = "Normal".equals(rating)
                ? winnerFromSets(game, result)
                : winnerFromSpecialRating(game, rating);
        game.completed = completed;
        game.dirty = true;
        if (completed) {
            game.scoreLockedByDevice = "";
            game.scoreLockedAt = "";
        }
    }

    private static String bounded(String value, String label, int maxLength) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.length() > maxLength) {
            throw new IllegalArgumentException(label + " ist zu lang.");
        }
        return normalized;
    }

    private static String score(String body, String field, String label) {
        String value = bounded(LocalApiJson.jsonField(body, field), label, 3);
        if (value.isBlank()) {
            return "";
        }
        if (!value.matches("\\d{1,2}")) {
            throw new IllegalArgumentException(label + " muss eine Zahl zwischen 0 und 99 sein.");
        }
        return String.valueOf(Integer.parseInt(value));
    }

    private static SetResult evaluateSets(String[][] scores, boolean requireCompletedResult) {
        int teamAWins = 0;
        int teamBWins = 0;
        int validSets = 0;
        boolean previousSetMissing = false;
        boolean matchDecided = false;
        for (int index = 0; index < scores.length; index++) {
            String rawA = scores[index][0];
            String rawB = scores[index][1];
            boolean hasA = !rawA.isBlank();
            boolean hasB = !rawB.isBlank();
            if (!hasA && !hasB) {
                previousSetMissing = true;
                continue;
            }
            if (hasA != hasB) {
                throw new IllegalArgumentException("Satz " + (index + 1) + " ist unvollständig.");
            }
            if (previousSetMissing) {
                throw new IllegalArgumentException("Vor Satz " + (index + 1) + " fehlt ein Satz.");
            }
            int scoreA = Integer.parseInt(rawA);
            int scoreB = Integer.parseInt(rawB);
            if (!isValidSetResult(scoreA, scoreB)) {
                if (requireCompletedResult) {
                    throw new IllegalArgumentException("Satz " + (index + 1) + " hat kein gültiges Endergebnis.");
                }
                continue;
            }
            if (matchDecided) {
                throw new IllegalArgumentException("Satz 3 darf nach einem 2:0 nicht eingetragen werden.");
            }
            if (scoreA > scoreB) {
                teamAWins++;
            } else {
                teamBWins++;
            }
            validSets++;
            matchDecided = teamAWins >= 2 || teamBWins >= 2;
        }
        if (requireCompletedResult && !(validSets == 1 || matchDecided)) {
            throw new IllegalArgumentException("Für den Spielabschluss fehlt ein vollständiges Ergebnis.");
        }
        return new SetResult(teamAWins, teamBWins, validSets);
    }

    private static boolean isValidSetResult(int scoreA, int scoreB) {
        int winnerPoints = Math.max(scoreA, scoreB);
        int difference = Math.abs(scoreA - scoreB);
        return winnerPoints >= 15 && difference >= 2
                && (winnerPoints == 15 || winnerPoints == 21 || difference == 2);
    }

    private static String winnerFromSets(GameState game, SetResult result) {
        if (result.teamAWins == result.teamBWins) {
            return "";
        }
        return result.teamAWins > result.teamBWins ? game.teamA : game.teamB;
    }

    private static String winnerFromSpecialRating(GameState game, String rating) {
        String normalized = rating.toLowerCase(java.util.Locale.GERMAN);
        boolean teamAFailed = normalized.contains("freilos a")
                || normalized.contains("verletzung a")
                || normalized.contains("aufgabe a")
                || normalized.contains("angetreten a");
        boolean teamBFailed = normalized.contains("freilos b")
                || normalized.contains("verletzung b")
                || normalized.contains("aufgabe b")
                || normalized.contains("angetreten b");
        if (teamAFailed == teamBFailed) {
            return "";
        }
        return teamAFailed ? game.teamB : game.teamA;
    }

    private static final class SetResult {
        private final int teamAWins;
        private final int teamBWins;
        private final int validSets;

        private SetResult(int teamAWins, int teamBWins, int validSets) {
            this.teamAWins = teamAWins;
            this.teamBWins = teamBWins;
            this.validSets = validSets;
        }
    }
}
