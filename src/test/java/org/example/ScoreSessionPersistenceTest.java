package org.example;

/** Standalone regression check; run with java -ea after test-compile. */
public final class ScoreSessionPersistenceTest {
    public static void main(String[] args) {
        GameState game = new GameState(new GameRow("1", "", "1", "Alpha", "Beta", "Ref"));
        String state = "{\"version\":1,\"firstServerTeamA\":\"Änne\",\"servingTeam\":\"B\",\"leftTeam\":\"B\"}";
        String body = "{\"referee\":\"Ref\",\"set1TeamA\":\"8\",\"set1TeamB\":\"6\",\"completed\":false,\"scoreEntryState\":"
                + LocalApiJson.jsonString(state) + "}";
        ScoreSubmissionValidator.validateAndApply(game, body);
        check(state.equals(game.scoreEntryState), "session was not saved with score");
        check("8".equals(game.set1TeamA), "score was not saved");
        check(state.equals(LocalApiJson.jsonField(LocalApiPayloads.gameJson(game), "score_entry_state")), "fresh device payload lost session");
        check(!LocalApiPayloads.publicGamesJson(java.util.List.of(game)).contains("score_entry_state"), "private session leaked to public display");
        try {
            ScoreSubmissionValidator.validateAndApply(game, body.replace(LocalApiJson.jsonString(state), LocalApiJson.jsonString("{" + "x".repeat(200_000) + "}")));
            throw new AssertionError("oversized state accepted");
        } catch (IllegalArgumentException expected) {
            check(state.equals(game.scoreEntryState), "invalid request changed state");
        }
        LocalApiGameUpdates.updateGameFromBody(game, body.replace("\"8\"", "\"9\""));
        check(game.scoreEntryState.isEmpty(), "admin score edit left stale state");
        ScoreSubmissionValidator.validateAndApply(game, body.replace("\"8\"", "\"21\"").replace("\"6\"", "\"19\"").replace("false", "true"));
        check(game.completed && game.scoreEntryState.isEmpty(), "completion retained resumable state");
        System.out.println("PASS: local session save/load, Unicode, public payload, size validation, admin edit and completion");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
