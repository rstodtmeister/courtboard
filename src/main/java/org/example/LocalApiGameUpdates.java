package org.example;

final class LocalApiGameUpdates {
    private LocalApiGameUpdates() {
    }

    static void updateGameFromBody(GameState game, String body) {
        String nextSet1TeamA = LocalApiJson.jsonField(body, "set1TeamA");
        String nextSet1TeamB = LocalApiJson.jsonField(body, "set1TeamB");
        String nextSet2TeamA = LocalApiJson.jsonField(body, "set2TeamA");
        String nextSet2TeamB = LocalApiJson.jsonField(body, "set2TeamB");
        String nextSet3TeamA = LocalApiJson.jsonField(body, "set3TeamA");
        String nextSet3TeamB = LocalApiJson.jsonField(body, "set3TeamB");
        String nextPointHistory = LocalApiJson.jsonField(body, "pointHistory");
        if (nextPointHistory.isBlank()) {
            nextPointHistory = inferredPointHistory(game, nextSet1TeamA, nextSet1TeamB, nextSet2TeamA, nextSet2TeamB, nextSet3TeamA, nextSet3TeamB);
        }

        String courtValue = LocalApiJson.jsonField(body, "court");
        if (!courtValue.isBlank() || body.contains("\"court\"")) {
            game.court = courtValue;
        }
        String refereeValue = LocalApiJson.jsonField(body, "referee");
        if (!refereeValue.isBlank() || body.contains("\"referee\"")) {
            game.referee = refereeValue;
        }
        game.result = LocalApiJson.jsonField(body, "result");
        game.winnerTeam = LocalApiJson.jsonField(body, "winnerTeam");
        game.gameRating = LocalApiJson.jsonField(body, "gameRating");
        game.set1TeamA = nextSet1TeamA;
        game.set1TeamB = nextSet1TeamB;
        game.set2TeamA = nextSet2TeamA;
        game.set2TeamB = nextSet2TeamB;
        game.set3TeamA = nextSet3TeamA;
        game.set3TeamB = nextSet3TeamB;
        game.pointHistory = nextPointHistory;
        game.printed = "true".equals(LocalApiJson.jsonField(body, "printed"));
        game.completed = "true".equals(LocalApiJson.jsonField(body, "completed"));
        if (game.completed) {
            game.scoreLockedByDevice = "";
            game.scoreLockedAt = "";
        }
        String dirtyValue = LocalApiJson.jsonField(body, "dirty");
        game.dirty = dirtyValue.isBlank() || "true".equals(dirtyValue);
    }

    private static String inferredPointHistory(GameState game, String set1A, String set1B, String set2A, String set2B, String set3A, String set3B) {
        String updated = inferPointForSet(game.pointHistory, 1, game.set1TeamA, game.set1TeamB, set1A, set1B);
        if (!updated.equals(game.pointHistory)) {
            return updated;
        }
        updated = inferPointForSet(game.pointHistory, 2, game.set2TeamA, game.set2TeamB, set2A, set2B);
        if (!updated.equals(game.pointHistory)) {
            return updated;
        }
        return inferPointForSet(game.pointHistory, 3, game.set3TeamA, game.set3TeamB, set3A, set3B);
    }

    private static String inferPointForSet(String pointHistory, int set, String oldAValue, String oldBValue, String newAValue, String newBValue) {
        int oldA = parseScore(oldAValue);
        int oldB = parseScore(oldBValue);
        int newA = parseScore(newAValue);
        int newB = parseScore(newBValue);
        if (newA == oldA + 1 && newB == oldB) {
            return appendPointHistory(pointHistory, set, "A", newA, newB);
        }
        if (newB == oldB + 1 && newA == oldA) {
            return appendPointHistory(pointHistory, set, "B", newA, newB);
        }
        return pointHistory;
    }

    private static int parseScore(String value) {
        if (value == null || value.isBlank()) {
            return 0;
        }
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException exception) {
            return 0;
        }
    }

    private static String appendPointHistory(String pointHistory, int set, String team, int scoreA, int scoreB) {
        String entry = "{\"set\":" + set + ",\"team\":\"" + team + "\",\"scoreA\":" + scoreA + ",\"scoreB\":" + scoreB + "}";
        if (pointHistory == null || pointHistory.isBlank() || "[]".equals(pointHistory.trim())) {
            return "[" + entry + "]";
        }
        String trimmed = pointHistory.trim();
        if (trimmed.endsWith("]")) {
            return trimmed.substring(0, trimmed.length() - 1) + "," + entry + "]";
        }
        return "[" + entry + "]";
    }
}
