package org.example;

import java.util.List;

final class LocalApiPayloads {
    private LocalApiPayloads() {
    }

    static String syncResponse(ScrapedPage page, List<GameRow> rows) {
        StringBuilder builder = new StringBuilder();
        builder.append("{\"source\":")
                .append(LocalApiJson.jsonString(page.sourceUrl()))
                .append(",\"title\":")
                .append(LocalApiJson.jsonString(page.title()))
                .append(",\"scrapedAt\":")
                .append(LocalApiJson.jsonString(page.scrapedAt().toString()))
                .append(",\"imported\":")
                .append(rows.size())
                .append(",\"games\":[");
        for (int index = 0; index < rows.size(); index++) {
            if (index > 0) {
                builder.append(',');
            }
            appendGame(builder, rows.get(index));
        }
        builder.append("]}");
        return builder.toString();
    }

    static String gamesJson(List<GameState> values) {
        StringBuilder builder = new StringBuilder("[");
        for (int index = 0; index < values.size(); index++) {
            if (index > 0) {
                builder.append(',');
            }
            builder.append(gameJson(values.get(index)));
        }
        return builder.append(']').toString();
    }

    static String gameJson(GameState game) {
        return new StringBuilder()
                .append('{')
                .append("\"id\":").append(LocalApiJson.jsonString(game.id)).append(',')
                .append("\"tournament_id\":").append(LocalApiJson.jsonString(game.tournamentId)).append(',')
                .append("\"number\":").append(LocalApiJson.jsonString(game.number)).append(',')
                .append("\"round\":").append(LocalApiJson.jsonString(game.round)).append(',')
                .append("\"game_date\":").append(LocalApiJson.jsonString(game.date)).append(',')
                .append("\"court\":").append(LocalApiJson.jsonString(game.court)).append(',')
                .append("\"display_order\":").append(LocalApiJson.jsonInteger(game.displayOrder)).append(',')
                .append("\"team_a\":").append(LocalApiJson.jsonString(game.teamA)).append(',')
                .append("\"team_b\":").append(LocalApiJson.jsonString(game.teamB)).append(',')
                .append("\"team_a_players\":").append(LocalApiJson.jsonArray(game.teamAPlayers)).append(',')
                .append("\"team_b_players\":").append(LocalApiJson.jsonArray(game.teamBPlayers)).append(',')
                .append("\"referee\":").append(LocalApiJson.jsonString(game.referee)).append(',')
                .append("\"result\":").append(LocalApiJson.jsonString(game.result)).append(',')
                .append("\"winner_team\":").append(LocalApiJson.jsonString(game.winnerTeam)).append(',')
                .append("\"edit_url\":").append(LocalApiJson.jsonString(game.editUrl)).append(',')
                .append("\"edit_method\":").append(LocalApiJson.jsonString(game.editMethod)).append(',')
                .append("\"edit_data\":").append(LocalApiJson.jsonString(game.editData)).append(',')
                .append("\"game_rating\":").append(LocalApiJson.jsonString(game.gameRating)).append(',')
                .append("\"set1_team_a\":").append(LocalApiJson.jsonString(game.set1TeamA)).append(',')
                .append("\"set1_team_b\":").append(LocalApiJson.jsonString(game.set1TeamB)).append(',')
                .append("\"set2_team_a\":").append(LocalApiJson.jsonString(game.set2TeamA)).append(',')
                .append("\"set2_team_b\":").append(LocalApiJson.jsonString(game.set2TeamB)).append(',')
                .append("\"set3_team_a\":").append(LocalApiJson.jsonString(game.set3TeamA)).append(',')
                .append("\"set3_team_b\":").append(LocalApiJson.jsonString(game.set3TeamB)).append(',')
                .append("\"printed\":").append(game.printed).append(',')
                .append("\"dirty\":").append(game.dirty).append(',')
                .append("\"completed\":").append(game.completed).append(',')
                .append("\"point_history\":").append(LocalApiJson.jsonString(game.pointHistory.isBlank() ? null : game.pointHistory)).append(',')
                .append("\"score_locked_by_device\":").append(LocalApiJson.jsonString(game.scoreLockedByDevice.isBlank() ? null : game.scoreLockedByDevice)).append(',')
                .append("\"score_locked_at\":").append(LocalApiJson.jsonString(game.scoreLockedAt.isBlank() ? null : game.scoreLockedAt))
                .append('}')
                .toString();
    }

    static String publicGamesJson(List<GameState> values) {
        StringBuilder builder = new StringBuilder("[");
        for (int index = 0; index < values.size(); index++) {
            if (index > 0) {
                builder.append(',');
            }
            builder.append(publicGameJson(values.get(index)));
        }
        return builder.append(']').toString();
    }

    private static String publicGameJson(GameState game) {
        return new StringBuilder()
                .append('{')
                .append("\"id\":").append(LocalApiJson.jsonString(game.id)).append(',')
                .append("\"tournament_id\":").append(LocalApiJson.jsonString(game.tournamentId)).append(',')
                .append("\"number\":").append(LocalApiJson.jsonString(game.number)).append(',')
                .append("\"round\":").append(LocalApiJson.jsonString(game.round)).append(',')
                .append("\"game_date\":").append(LocalApiJson.jsonString(game.date)).append(',')
                .append("\"court\":").append(LocalApiJson.jsonString(game.court)).append(',')
                .append("\"display_order\":").append(LocalApiJson.jsonInteger(game.displayOrder)).append(',')
                .append("\"team_a\":").append(LocalApiJson.jsonString(game.teamA)).append(',')
                .append("\"team_b\":").append(LocalApiJson.jsonString(game.teamB)).append(',')
                .append("\"team_a_players\":").append(LocalApiJson.jsonArray(game.teamAPlayers)).append(',')
                .append("\"team_b_players\":").append(LocalApiJson.jsonArray(game.teamBPlayers)).append(',')
                .append("\"referee\":").append(LocalApiJson.jsonString(game.referee)).append(',')
                .append("\"result\":").append(LocalApiJson.jsonString(game.result)).append(',')
                .append("\"winner_team\":").append(LocalApiJson.jsonString(game.winnerTeam)).append(',')
                .append("\"game_rating\":").append(LocalApiJson.jsonString(game.gameRating)).append(',')
                .append("\"set1_team_a\":").append(LocalApiJson.jsonString(game.set1TeamA)).append(',')
                .append("\"set1_team_b\":").append(LocalApiJson.jsonString(game.set1TeamB)).append(',')
                .append("\"set2_team_a\":").append(LocalApiJson.jsonString(game.set2TeamA)).append(',')
                .append("\"set2_team_b\":").append(LocalApiJson.jsonString(game.set2TeamB)).append(',')
                .append("\"set3_team_a\":").append(LocalApiJson.jsonString(game.set3TeamA)).append(',')
                .append("\"set3_team_b\":").append(LocalApiJson.jsonString(game.set3TeamB)).append(',')
                .append("\"printed\":false,")
                .append("\"dirty\":false,")
                .append("\"completed\":").append(game.completed).append(',')
                .append("\"point_history\":").append(LocalApiJson.jsonString(game.pointHistory.isBlank() ? null : game.pointHistory)).append(',')
                .append("\"score_locked_by_device\":").append(LocalApiJson.jsonString(game.scoreLockedByDevice.isBlank() ? null : "locked")).append(',')
                .append("\"score_locked_at\":null")
                .append('}')
                .toString();
    }

    static String linksJson(List<LinkState> links) {
        StringBuilder builder = new StringBuilder("[");
        for (int index = 0; index < links.size(); index++) {
            if (index > 0) {
                builder.append(',');
            }
            builder.append(linkJson(links.get(index)));
        }
        return builder.append(']').toString();
    }

    static String linkJson(LinkState link) {
        return new StringBuilder()
                .append('{')
                .append("\"id\":").append(LocalApiJson.jsonString(link.id)).append(',')
                .append("\"tournament_id\":").append(LocalApiJson.jsonString(link.tournamentId)).append(',')
                .append("\"game_id\":").append(LocalApiJson.jsonString(link.gameId.isBlank() ? null : link.gameId)).append(',')
                .append("\"court\":").append(LocalApiJson.jsonString(link.court.isBlank() ? null : link.court)).append(',')
                .append("\"token\":").append(LocalApiJson.jsonString(link.token)).append(',')
                .append("\"expires_at\":null,")
                .append("\"used_at\":").append(LocalApiJson.jsonString(link.usedAt.isBlank() ? null : link.usedAt)).append(',')
                .append("\"disabled_at\":").append(LocalApiJson.jsonString(link.disabledAt.isBlank() ? null : link.disabledAt)).append(',')
                .append("\"created_at\":").append(LocalApiJson.jsonString(link.createdAt))
                .append('}')
                .toString();
    }

    static String scoreEntryLinkJson(LinkState link) {
        return new StringBuilder()
                .append('{')
                .append("\"id\":").append(LocalApiJson.jsonString(link.id)).append(',')
                .append("\"tournament_id\":").append(LocalApiJson.jsonString(link.tournamentId)).append(',')
                .append("\"game_id\":").append(LocalApiJson.jsonString(link.gameId.isBlank() ? null : link.gameId)).append(',')
                .append("\"court\":").append(LocalApiJson.jsonString(link.court.isBlank() ? null : link.court)).append(',')
                .append("\"expires_at\":null,")
                .append("\"used_at\":").append(LocalApiJson.jsonString(link.usedAt.isBlank() ? null : link.usedAt))
                .append('}')
                .toString();
    }

    private static void appendGame(StringBuilder builder, GameRow game) {
        builder.append('{')
                .append("\"number\":").append(LocalApiJson.jsonString(game.number())).append(',')
                .append("\"round\":").append(LocalApiJson.jsonString(game.round())).append(',')
                .append("\"game_date\":").append(LocalApiJson.jsonString(game.date())).append(',')
                .append("\"court\":").append(LocalApiJson.jsonString(game.court())).append(',')
                .append("\"team_a\":").append(LocalApiJson.jsonString(game.teamA())).append(',')
                .append("\"team_b\":").append(LocalApiJson.jsonString(game.teamB())).append(',')
                .append("\"team_a_players\":").append(LocalApiJson.jsonArray(GameState.defaultPlayers(game.teamA()))).append(',')
                .append("\"team_b_players\":").append(LocalApiJson.jsonArray(GameState.defaultPlayers(game.teamB()))).append(',')
                .append("\"referee\":").append(LocalApiJson.jsonString(game.referee())).append(',')
                .append("\"result\":").append(LocalApiJson.jsonString(game.result())).append(',')
                .append("\"winner_team\":").append(LocalApiJson.jsonString(game.winnerTeam() == 0 ? "" : String.valueOf(game.winnerTeam()))).append(',')
                .append("\"edit_url\":").append(LocalApiJson.jsonString(game.editUrl())).append(',')
                .append("\"edit_method\":").append(LocalApiJson.jsonString(game.editMethod())).append(',')
                .append("\"edit_data\":").append(LocalApiJson.jsonString(game.editData())).append(',')
                .append("\"game_rating\":").append(LocalApiJson.jsonString(game.gameRating())).append(',')
                .append("\"set1_team_a\":").append(LocalApiJson.jsonString(game.set1TeamA())).append(',')
                .append("\"set1_team_b\":").append(LocalApiJson.jsonString(game.set1TeamB())).append(',')
                .append("\"set2_team_a\":").append(LocalApiJson.jsonString(game.set2TeamA())).append(',')
                .append("\"set2_team_b\":").append(LocalApiJson.jsonString(game.set2TeamB())).append(',')
                .append("\"set3_team_a\":").append(LocalApiJson.jsonString(game.set3TeamA())).append(',')
                .append("\"set3_team_b\":").append(LocalApiJson.jsonString(game.set3TeamB())).append(',')
                .append("\"completed\":false")
                .append('}');
    }
}
