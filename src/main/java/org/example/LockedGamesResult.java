package org.example;

import java.util.List;

class LockedGamesResult {
    final int status;
    final String error;
    final List<GameState> games;

    LockedGamesResult(int status, String error, List<GameState> games) {
        this.status = status;
        this.error = error;
        this.games = games;
    }

    static LockedGamesResult ok(List<GameState> games) {
        return new LockedGamesResult(200, "", games);
    }

    static LockedGamesResult error(int status, String error) {
        return new LockedGamesResult(status, error, List.of());
    }
}
