package org.example;

import java.util.List;

class GameState {
    final String id;
    final String tournamentId = "local-tournament-1";
    final String number;
    final String round;
    final String date;
    String court;
    int displayOrder;
    final String teamA;
    final String teamB;
    final List<String> teamAPlayers;
    final List<String> teamBPlayers;
    String referee;
    String result;
    String winnerTeam;
    final String editUrl;
    final String editMethod;
    final String editData;
    String gameRating;
    String set1TeamA;
    String set1TeamB;
    String set2TeamA;
    String set2TeamB;
    String set3TeamA;
    String set3TeamB;
    boolean printed;
    boolean dirty;
    boolean completed;
    String pointHistory = "";
    String scoreLockedByDevice = "";
    String scoreLockedAt = "";
    String scoreBlockedDevice = "";
    String scoreBlockedUntil = "";

    GameState(GameRow row) {
        this(row, defaultPlayers(row.teamA()), defaultPlayers(row.teamB()));
    }

    GameState(GameRow row, List<String> teamAPlayers, List<String> teamBPlayers) {
        this.id = "local-game-" + row.number();
        this.number = row.number();
        this.round = row.round();
        this.date = row.date();
        this.court = row.court();
        this.teamA = row.teamA();
        this.teamB = row.teamB();
        this.teamAPlayers = List.copyOf(teamAPlayers);
        this.teamBPlayers = List.copyOf(teamBPlayers);
        this.referee = row.referee();
        this.result = row.result();
        this.winnerTeam = row.winnerTeam() == 0 ? "" : String.valueOf(row.winnerTeam());
        this.editUrl = row.editUrl();
        this.editMethod = row.editMethod();
        this.editData = row.editData();
        this.gameRating = row.gameRating();
        this.set1TeamA = row.set1TeamA();
        this.set1TeamB = row.set1TeamB();
        this.set2TeamA = row.set2TeamA();
        this.set2TeamB = row.set2TeamB();
        this.set3TeamA = row.set3TeamA();
        this.set3TeamB = row.set3TeamB();
    }

    static List<String> defaultPlayers(String team) {
        String name = team == null || team.isBlank() ? "Team" : team.trim();
        String teamWithoutSeed = name.replaceFirst("\\s*\\(\\d+\\)\\s*$", "").trim();
        if ("(Freilos)".equalsIgnoreCase(teamWithoutSeed)) {
            return List.of("Freilos", "Freilos");
        }

        String[] players = teamWithoutSeed.split("\\s+-\\s+", 2);
        if (players.length == 2 && !players[0].isBlank() && !players[1].isBlank()) {
            return List.of(players[0].trim(), players[1].trim());
        }

        return List.of(name + " Spieler 1", name + " Spieler 2");
    }
}
