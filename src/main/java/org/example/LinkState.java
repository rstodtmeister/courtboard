package org.example;

import java.time.Instant;
import java.util.UUID;

class LinkState {
    final String id = UUID.randomUUID().toString();
    final String token = UUID.randomUUID().toString().replace("-", "");
    final String tournamentId;
    final String gameId;
    final String court;
    final String createdAt = Instant.now().toString();
    String usedAt = "";
    String disabledAt = "";

    LinkState(String tournamentId, String gameId, String court) {
        this.tournamentId = tournamentId == null ? "" : tournamentId;
        this.gameId = gameId == null ? "" : gameId;
        this.court = court == null ? "" : court;
    }
}
