package org.example;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.EnumMap;
import java.util.Map;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class LocalApiServer {
    private final WebPageScraper scraper;
    private final int port;
    private final List<GameState> games = new ArrayList<>();
    private final List<LinkState> links = new ArrayList<>();

    public LocalApiServer(int port) {
        this.port = port;
        this.scraper = new WebPageScraper();
        seedGames();
    }

    public void start() throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", port), 0);
        server.createContext("/api/health", this::handleHealth);
        server.createContext("/api/games", this::handleGames);
        server.createContext("/api/games/update", this::handleUpdateGame);
        server.createContext("/api/games/sync", this::handleSyncGames);
        server.createContext("/api/score-links", this::handleScoreLinks);
        server.createContext("/api/score-links/disable", this::handleDisableScoreLink);
        server.createContext("/api/score-entry", this::handleScoreEntry);
        server.createContext("/api/score-entry/unlock", this::handleUnlockScoreEntry);
        server.createContext("/api/submit-score", this::handleSubmitScore);
        server.createContext("/api/qr", this::handleQr);
        server.setExecutor(null);
        server.start();
        System.out.println("Lokale CourtBoard API laeuft: http://127.0.0.1:" + port);
        System.out.println("Im Netzwerk erreichbar ueber die LAN-IP dieses Rechners, z. B. http://<rechner-ip>:" + port);
    }

    private void handleHealth(HttpExchange exchange) throws IOException {
        if (handleCors(exchange)) {
            return;
        }
        if (!"GET".equals(exchange.getRequestMethod())) {
            writeJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }
        writeJson(exchange, 200, "{\"ok\":true}");
    }

    private void handleSyncGames(HttpExchange exchange) throws IOException {
        if (handleCors(exchange)) {
            return;
        }
        if (!"POST".equals(exchange.getRequestMethod())) {
            writeJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }

        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        SyncRequest request = SyncRequest.fromJson(body);
        if (request.url().isBlank()) {
            writeJson(exchange, 400, "{\"error\":\"url is required\"}");
            return;
        }

        try {
            ScrapedPage page = scraper.scrape(request.url(), request.username(), request.password());
            List<GameRow> rows = gameRows(page);
            if (request.ignoreResults()) {
                rows = rowsWithoutResults(rows);
            }
            synchronized (games) {
                games.clear();
                for (GameRow row : rows) {
                    games.add(new GameState(row));
                }
            }
            writeJson(exchange, 200, syncResponse(page, rows));
        } catch (Exception exception) {
            writeJson(exchange, 500, "{\"error\":" + jsonString(exception.getMessage()) + "}");
        }
    }

    private List<GameRow> rowsWithoutResults(List<GameRow> rows) {
        List<GameRow> result = new ArrayList<>();
        for (GameRow row : rows) {
            result.add(new GameRow(
                    row.number(),
                    row.round(),
                    row.date(),
                    row.court(),
                    row.teamA(),
                    row.teamB(),
                    row.referee(),
                    "",
                    0,
                    row.editUrl(),
                    row.editMethod(),
                    row.editData(),
                    row.gameRating(),
                    "",
                    "",
                    "",
                    "",
                    "",
                    ""));
        }
        return result;
    }

    private void handleGames(HttpExchange exchange) throws IOException {
        if (handleCors(exchange)) {
            return;
        }
        if (!"GET".equals(exchange.getRequestMethod())) {
            writeJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }
        writeJson(exchange, 200, "{\"games\":" + gamesJson(allGames()) + "}");
    }

    private void handleUpdateGame(HttpExchange exchange) throws IOException {
        if (handleCors(exchange)) {
            return;
        }
        if (!"POST".equals(exchange.getRequestMethod())) {
            writeJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        String gameId = jsonField(body, "gameId");
        GameState game = findGame(gameId);
        if (game == null) {
            writeJson(exchange, 404, "{\"error\":\"game not found\"}");
            return;
        }
        updateGameFromBody(game, body);
        writeJson(exchange, 200, "{\"game\":" + gameJson(game) + "}");
    }

    private void handleScoreLinks(HttpExchange exchange) throws IOException {
        if (handleCors(exchange)) {
            return;
        }
        if ("GET".equals(exchange.getRequestMethod())) {
            writeJson(exchange, 200, "{\"links\":" + linksJson() + "}");
            return;
        }
        if (!"POST".equals(exchange.getRequestMethod())) {
            writeJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        LinkState link = new LinkState(jsonField(body, "tournamentId"), jsonField(body, "gameId"), jsonField(body, "court"));
        synchronized (links) {
            links.add(link);
        }
        writeJson(exchange, 200, "{\"id\":" + jsonString(link.id) + ",\"token\":" + jsonString(link.token) + "}");
    }

    private void handleDisableScoreLink(HttpExchange exchange) throws IOException {
        if (handleCors(exchange)) {
            return;
        }
        if (!"POST".equals(exchange.getRequestMethod())) {
            writeJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        String linkId = jsonField(body, "linkId");
        synchronized (links) {
            for (LinkState link : links) {
                if (link.id.equals(linkId)) {
                    link.disabledAt = java.time.Instant.now().toString();
                    writeJson(exchange, 200, "{\"ok\":true}");
                    return;
                }
            }
        }
        writeJson(exchange, 404, "{\"error\":\"token not found\"}");
    }

    private void handleScoreEntry(HttpExchange exchange) throws IOException {
        if (handleCors(exchange)) {
            return;
        }
        if (!"GET".equals(exchange.getRequestMethod())) {
            writeJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }
        LinkState link = findActiveLink(queryParam(exchange.getRequestURI().getRawQuery(), "token"));
        if (link == null) {
            writeJson(exchange, 404, "{\"error\":\"Ungueltiger Token\"}");
            return;
        }
        String deviceId = queryParam(exchange.getRequestURI().getRawQuery(), "deviceId");
        LockedGamesResult result = lockedGamesForDevice(link, deviceId);
        if (!result.error.isBlank()) {
            writeJson(exchange, result.status, "{\"error\":" + jsonString(result.error) + "}");
            return;
        }
        writeJson(exchange, 200, "{\"link\":" + linkJson(link) + ",\"games\":" + gamesJson(result.games) + ",\"allTeams\":" + jsonArray(allTeamNames()) + "}");
    }

    private void handleUnlockScoreEntry(HttpExchange exchange) throws IOException {
        if (handleCors(exchange)) {
            return;
        }
        if (!"POST".equals(exchange.getRequestMethod())) {
            writeJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        GameState game = findGame(jsonField(body, "gameId"));
        if (game == null) {
            writeJson(exchange, 404, "{\"error\":\"Spiel nicht gefunden\"}");
            return;
        }
        synchronized (game) {
            if (!game.scoreLockedByDevice.isBlank()) {
                game.scoreBlockedDevice = game.scoreLockedByDevice;
                game.scoreBlockedUntil = java.time.Instant.now().plusSeconds(5 * 60).toString();
            }
            game.scoreLockedByDevice = "";
            game.scoreLockedAt = "";
        }
        writeJson(exchange, 200, "{\"ok\":true}");
    }

    private void handleSubmitScore(HttpExchange exchange) throws IOException {
        if (handleCors(exchange)) {
            return;
        }
        if (!"POST".equals(exchange.getRequestMethod())) {
            writeJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        LinkState link = findActiveLink(jsonField(body, "token"));
        if (link == null) {
            writeJson(exchange, 404, "{\"error\":\"Ungueltiger Token\"}");
            return;
        }
        GameState game = findGame(jsonField(body, "gameId"));
        if (game == null || !isAllowed(link, game)) {
            writeJson(exchange, 403, "{\"error\":\"Spiel ist fuer diesen Token nicht freigegeben\"}");
            return;
        }
        String deviceId = jsonField(body, "deviceId");
        synchronized (game) {
            if (deviceId.isBlank()) {
                writeJson(exchange, 403, "{\"error\":\"Dieses Geraet konnte nicht erkannt werden. Bitte Link neu oeffnen.\"}");
                return;
            }
            if (isScoreDeviceBlocked(game, deviceId)) {
                writeJson(exchange, 423, "{\"error\":\"Keine Eingabe moeglich. Bitte beim Admin melden.\"}");
                return;
            }
            if (!game.scoreLockedByDevice.isBlank() && !game.scoreLockedByDevice.equals(deviceId)) {
                writeJson(exchange, 423, "{\"error\":\"Dieses Spiel wird bereits auf einem anderen Geraet erfasst.\"}");
                return;
            }
            if (game.scoreLockedByDevice.isBlank()) {
                game.scoreLockedByDevice = deviceId;
                game.scoreLockedAt = java.time.Instant.now().toString();
            }
        }
        updateGameFromBody(game, body);
        link.usedAt = java.time.Instant.now().toString();
        writeJson(exchange, 200, "{\"ok\":true}");
    }

    private void handleQr(HttpExchange exchange) throws IOException {
        if (handleCors(exchange)) {
            return;
        }
        if (!"GET".equals(exchange.getRequestMethod())) {
            writeJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }

        String value = queryParam(exchange.getRequestURI().getRawQuery(), "value");
        if (value.isBlank()) {
            writeJson(exchange, 400, "{\"error\":\"value is required\"}");
            return;
        }

        try {
            writeSvg(exchange, qrSvg(value));
        } catch (WriterException exception) {
            writeJson(exchange, 500, "{\"error\":\"QR-Code konnte nicht erzeugt werden\"}");
        }
    }

    private boolean handleCors(HttpExchange exchange) throws IOException {
        Headers headers = exchange.getResponseHeaders();
        headers.add("Access-Control-Allow-Origin", "*");
        headers.add("Access-Control-Allow-Headers", "content-type");
        headers.add("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        if ("OPTIONS".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return true;
        }
        return false;
    }

    private List<GameRow> gameRows(ScrapedPage page) {
        List<GameRow> rows = new ArrayList<>();
        for (PageSection section : page.sections()) {
            for (String paragraph : section.paragraphs()) {
                rows.add(GameRow.fromParagraph(paragraph));
            }
        }
        return rows;
    }

    private String syncResponse(ScrapedPage page, List<GameRow> rows) {
        StringBuilder builder = new StringBuilder();
        builder.append("{\"source\":")
                .append(jsonString(page.sourceUrl()))
                .append(",\"title\":")
                .append(jsonString(page.title()))
                .append(",\"scrapedAt\":")
                .append(jsonString(page.scrapedAt().toString()))
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

    private List<GameState> allGames() {
        synchronized (games) {
            return new ArrayList<>(games);
        }
    }

    private List<String> allTeamNames() {
        java.util.TreeSet<String> teams = new java.util.TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        for (GameState game : allGames()) {
            if (!game.teamA.isBlank() && !"(Freilos)".equalsIgnoreCase(game.teamA)) {
                teams.add(game.teamA);
            }
            if (!game.teamB.isBlank() && !"(Freilos)".equalsIgnoreCase(game.teamB)) {
                teams.add(game.teamB);
            }
        }
        return new ArrayList<>(teams);
    }

    private List<GameState> allowedGames(LinkState link) {
        List<GameState> result = new ArrayList<>();
        for (GameState game : allGames()) {
            if (isAllowed(link, game)) {
                result.add(game);
            }
        }
        return result;
    }

    private LockedGamesResult lockedGamesForDevice(LinkState link, String deviceId) {
        if (deviceId == null || deviceId.isBlank()) {
            return LockedGamesResult.error(403, "Dieses Geraet konnte nicht erkannt werden. Bitte Link neu oeffnen.");
        }

        List<GameState> candidates = allowedGames(link);
        if (candidates.isEmpty()) {
            return LockedGamesResult.ok(List.of());
        }

        GameState game = candidates.get(0);
        if (!link.court.isBlank() && link.gameId.isBlank()) {
            game = null;
            for (GameState candidate : candidates) {
                if (!candidate.completed) {
                    game = candidate;
                    break;
                }
            }
            if (game == null) {
                return LockedGamesResult.ok(List.of());
            }
        }

        synchronized (game) {
            if (isScoreDeviceBlocked(game, deviceId)) {
                return LockedGamesResult.error(423, "Keine Eingabe moeglich. Bitte beim Admin melden.");
            }
            if (!game.scoreLockedByDevice.isBlank() && !game.scoreLockedByDevice.equals(deviceId)) {
                return LockedGamesResult.error(423, "Dieses Spiel wird bereits auf einem anderen Geraet erfasst.");
            }
            if (game.scoreLockedByDevice.isBlank() && !game.completed) {
                game.scoreLockedByDevice = deviceId;
                game.scoreLockedAt = java.time.Instant.now().toString();
            }
        }
        return LockedGamesResult.ok(List.of(game));
    }

    private boolean isScoreDeviceBlocked(GameState game, String deviceId) {
        if (deviceId == null || deviceId.isBlank() || game.scoreBlockedDevice.isBlank() || !game.scoreBlockedDevice.equals(deviceId)) {
            return false;
        }
        try {
            java.time.Instant blockedUntil = java.time.Instant.parse(game.scoreBlockedUntil);
            if (java.time.Instant.now().isBefore(blockedUntil)) {
                return true;
            }
        } catch (RuntimeException ignored) {
            // Invalid timestamps should not permanently block a device.
        }
        game.scoreBlockedDevice = "";
        game.scoreBlockedUntil = "";
        return false;
    }

    private boolean isAllowed(LinkState link, GameState game) {
        if (!link.tournamentId.isBlank() && !link.tournamentId.equals(game.tournamentId)) {
            return false;
        }
        if (!link.gameId.isBlank()) {
            return link.gameId.equals(game.id);
        }
        return !link.court.isBlank() && link.court.equals(game.court);
    }

    private GameState findGame(String gameId) {
        if (gameId == null || gameId.isBlank()) {
            return null;
        }
        synchronized (games) {
            for (GameState game : games) {
                if (game.id.equals(gameId)) {
                    return game;
                }
            }
        }
        return null;
    }

    private LinkState findActiveLink(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        synchronized (links) {
            for (LinkState link : links) {
                if (link.token.equals(token) && link.disabledAt.isBlank()) {
                    return link;
                }
            }
        }
        return null;
    }

    private void updateGameFromBody(GameState game, String body) {
        String nextSet1TeamA = jsonField(body, "set1TeamA");
        String nextSet1TeamB = jsonField(body, "set1TeamB");
        String nextSet2TeamA = jsonField(body, "set2TeamA");
        String nextSet2TeamB = jsonField(body, "set2TeamB");
        String nextSet3TeamA = jsonField(body, "set3TeamA");
        String nextSet3TeamB = jsonField(body, "set3TeamB");
        String nextPointHistory = jsonField(body, "pointHistory");
        if (nextPointHistory.isBlank()) {
            nextPointHistory = inferredPointHistory(game, nextSet1TeamA, nextSet1TeamB, nextSet2TeamA, nextSet2TeamB, nextSet3TeamA, nextSet3TeamB);
        }

        String courtValue = jsonField(body, "court");
        if (!courtValue.isBlank() || body.contains("\"court\"")) {
            game.court = courtValue;
        }
        String refereeValue = jsonField(body, "referee");
        if (!refereeValue.isBlank() || body.contains("\"referee\"")) {
            game.referee = refereeValue;
        }
        game.result = jsonField(body, "result");
        game.winnerTeam = jsonField(body, "winnerTeam");
        game.gameRating = jsonField(body, "gameRating");
        game.set1TeamA = nextSet1TeamA;
        game.set1TeamB = nextSet1TeamB;
        game.set2TeamA = nextSet2TeamA;
        game.set2TeamB = nextSet2TeamB;
        game.set3TeamA = nextSet3TeamA;
        game.set3TeamB = nextSet3TeamB;
        game.pointHistory = nextPointHistory;
        game.printed = "true".equals(jsonField(body, "printed"));
        game.completed = "true".equals(jsonField(body, "completed"));
        if (game.completed) {
            game.scoreLockedByDevice = "";
            game.scoreLockedAt = "";
        }
        String dirtyValue = jsonField(body, "dirty");
        game.dirty = dirtyValue.isBlank() || "true".equals(dirtyValue);
    }

    private String inferredPointHistory(GameState game, String set1A, String set1B, String set2A, String set2B, String set3A, String set3B) {
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

    private String inferPointForSet(String pointHistory, int set, String oldAValue, String oldBValue, String newAValue, String newBValue) {
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

    private int parseScore(String value) {
        if (value == null || value.isBlank()) {
            return 0;
        }
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException exception) {
            return 0;
        }
    }

    private String appendPointHistory(String pointHistory, int set, String team, int scoreA, int scoreB) {
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

    private String firstNonBlank(String first, String second) {
        return first == null || first.isBlank() ? second : first;
    }

    private String gamesJson(List<GameState> values) {
        StringBuilder builder = new StringBuilder("[");
        for (int index = 0; index < values.size(); index++) {
            if (index > 0) {
                builder.append(',');
            }
            builder.append(gameJson(values.get(index)));
        }
        return builder.append(']').toString();
    }

    private String gameJson(GameState game) {
        return new StringBuilder()
                .append('{')
                .append("\"id\":").append(jsonString(game.id)).append(',')
                .append("\"tournament_id\":").append(jsonString(game.tournamentId)).append(',')
                .append("\"number\":").append(jsonString(game.number)).append(',')
                .append("\"round\":").append(jsonString(game.round)).append(',')
                .append("\"game_date\":").append(jsonString(game.date)).append(',')
                .append("\"court\":").append(jsonString(game.court)).append(',')
                .append("\"team_a\":").append(jsonString(game.teamA)).append(',')
                .append("\"team_b\":").append(jsonString(game.teamB)).append(',')
                .append("\"team_a_players\":").append(jsonArray(game.teamAPlayers)).append(',')
                .append("\"team_b_players\":").append(jsonArray(game.teamBPlayers)).append(',')
                .append("\"referee\":").append(jsonString(game.referee)).append(',')
                .append("\"result\":").append(jsonString(game.result)).append(',')
                .append("\"winner_team\":").append(jsonString(game.winnerTeam)).append(',')
                .append("\"edit_url\":").append(jsonString(game.editUrl)).append(',')
                .append("\"edit_method\":").append(jsonString(game.editMethod)).append(',')
                .append("\"edit_data\":").append(jsonString(game.editData)).append(',')
                .append("\"game_rating\":").append(jsonString(game.gameRating)).append(',')
                .append("\"set1_team_a\":").append(jsonString(game.set1TeamA)).append(',')
                .append("\"set1_team_b\":").append(jsonString(game.set1TeamB)).append(',')
                .append("\"set2_team_a\":").append(jsonString(game.set2TeamA)).append(',')
                .append("\"set2_team_b\":").append(jsonString(game.set2TeamB)).append(',')
                .append("\"set3_team_a\":").append(jsonString(game.set3TeamA)).append(',')
                .append("\"set3_team_b\":").append(jsonString(game.set3TeamB)).append(',')
                .append("\"printed\":").append(game.printed).append(',')
                .append("\"dirty\":").append(game.dirty).append(',')
                .append("\"completed\":").append(game.completed).append(',')
                .append("\"point_history\":").append(jsonString(game.pointHistory.isBlank() ? null : game.pointHistory)).append(',')
                .append("\"score_locked_by_device\":").append(jsonString(game.scoreLockedByDevice.isBlank() ? null : game.scoreLockedByDevice)).append(',')
                .append("\"score_locked_at\":").append(jsonString(game.scoreLockedAt.isBlank() ? null : game.scoreLockedAt))
                .append('}')
                .toString();
    }

    private String linksJson() {
        StringBuilder builder = new StringBuilder("[");
        synchronized (links) {
            for (int index = 0; index < links.size(); index++) {
                if (index > 0) {
                    builder.append(',');
                }
                builder.append(linkJson(links.get(index)));
            }
        }
        return builder.append(']').toString();
    }

    private String jsonArray(List<String> values) {
        StringBuilder builder = new StringBuilder("[");
        for (int index = 0; index < values.size(); index++) {
            if (index > 0) {
                builder.append(',');
            }
            builder.append(jsonString(values.get(index)));
        }
        return builder.append(']').toString();
    }

    private String linkJson(LinkState link) {
        return new StringBuilder()
                .append('{')
                .append("\"id\":").append(jsonString(link.id)).append(',')
                .append("\"tournament_id\":").append(jsonString(link.tournamentId)).append(',')
                .append("\"game_id\":").append(jsonString(link.gameId.isBlank() ? null : link.gameId)).append(',')
                .append("\"court\":").append(jsonString(link.court.isBlank() ? null : link.court)).append(',')
                .append("\"token\":").append(jsonString(link.token)).append(',')
                .append("\"expires_at\":null,")
                .append("\"used_at\":").append(jsonString(link.usedAt.isBlank() ? null : link.usedAt)).append(',')
                .append("\"disabled_at\":").append(jsonString(link.disabledAt.isBlank() ? null : link.disabledAt)).append(',')
                .append("\"created_at\":").append(jsonString(link.createdAt))
                .append('}')
                .toString();
    }

    private void appendGame(StringBuilder builder, GameRow game) {
        builder.append('{')
                .append("\"number\":").append(jsonString(game.number())).append(',')
                .append("\"round\":").append(jsonString(game.round())).append(',')
                .append("\"game_date\":").append(jsonString(game.date())).append(',')
                .append("\"court\":").append(jsonString(game.court())).append(',')
                .append("\"team_a\":").append(jsonString(game.teamA())).append(',')
                .append("\"team_b\":").append(jsonString(game.teamB())).append(',')
                .append("\"team_a_players\":").append(jsonArray(GameState.defaultPlayers(game.teamA()))).append(',')
                .append("\"team_b_players\":").append(jsonArray(GameState.defaultPlayers(game.teamB()))).append(',')
                .append("\"referee\":").append(jsonString(game.referee())).append(',')
                .append("\"result\":").append(jsonString(game.result())).append(',')
                .append("\"winner_team\":").append(jsonString(game.winnerTeam() == 0 ? "" : String.valueOf(game.winnerTeam()))).append(',')
                .append("\"edit_url\":").append(jsonString(game.editUrl())).append(',')
                .append("\"edit_method\":").append(jsonString(game.editMethod())).append(',')
                .append("\"edit_data\":").append(jsonString(game.editData())).append(',')
                .append("\"game_rating\":").append(jsonString(game.gameRating())).append(',')
                .append("\"set1_team_a\":").append(jsonString(game.set1TeamA())).append(',')
                .append("\"set1_team_b\":").append(jsonString(game.set1TeamB())).append(',')
                .append("\"set2_team_a\":").append(jsonString(game.set2TeamA())).append(',')
                .append("\"set2_team_b\":").append(jsonString(game.set2TeamB())).append(',')
                .append("\"set3_team_a\":").append(jsonString(game.set3TeamA())).append(',')
                .append("\"set3_team_b\":").append(jsonString(game.set3TeamB())).append(',')
                .append("\"completed\":false")
                .append('}');
    }

    private void writeJson(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream response = exchange.getResponseBody()) {
            response.write(bytes);
        }
    }

    private void writeSvg(HttpExchange exchange, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "image/svg+xml; charset=utf-8");
        exchange.sendResponseHeaders(200, bytes.length);
        try (OutputStream response = exchange.getResponseBody()) {
            response.write(bytes);
        }
    }

    private String qrSvg(String value) throws WriterException {
        Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
        hints.put(EncodeHintType.CHARACTER_SET, StandardCharsets.UTF_8.name());
        hints.put(EncodeHintType.MARGIN, 2);
        BitMatrix matrix = new QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 0, 0, hints);
        StringBuilder svg = new StringBuilder();
        svg.append("<svg viewBox=\"0 0 ")
                .append(matrix.getWidth())
                .append(' ')
                .append(matrix.getHeight())
                .append("\" role=\"img\" xmlns=\"http://www.w3.org/2000/svg\">");
        svg.append("<rect width=\"100%\" height=\"100%\" fill=\"#fff\"/>");
        svg.append("<path fill=\"#000\" d=\"");
        for (int y = 0; y < matrix.getHeight(); y++) {
            for (int x = 0; x < matrix.getWidth(); x++) {
                if (matrix.get(x, y)) {
                    svg.append('M').append(x).append(' ').append(y).append("h1v1h-1z");
                }
            }
        }
        svg.append("\"/></svg>");
        return svg.toString();
    }

    private String queryParam(String rawQuery, String name) {
        if (rawQuery == null || rawQuery.isBlank()) {
            return "";
        }
        for (String part : rawQuery.split("&")) {
            String[] field = part.split("=", 2);
            if (field.length == 2 && name.equals(URLDecoder.decode(field[0], StandardCharsets.UTF_8))) {
                return URLDecoder.decode(field[1], StandardCharsets.UTF_8);
            }
        }
        return "";
    }

    private static String jsonField(String json, String name) {
        String marker = "\"" + name + "\"";
        int keyIndex = json.indexOf(marker);
        if (keyIndex < 0) {
            return "";
        }
        int colonIndex = json.indexOf(':', keyIndex + marker.length());
        if (colonIndex < 0) {
            return "";
        }
        int cursor = colonIndex + 1;
        while (cursor < json.length() && Character.isWhitespace(json.charAt(cursor))) {
            cursor++;
        }
        if (json.startsWith("true", cursor)) {
            return "true";
        }
        if (json.startsWith("false", cursor)) {
            return "false";
        }
        if (cursor >= json.length() || json.charAt(cursor) != '"') {
            return "";
        }

        StringBuilder value = new StringBuilder();
        boolean escaping = false;
        for (int index = cursor + 1; index < json.length(); index++) {
            char character = json.charAt(index);
            if (escaping) {
                value.append(character);
                escaping = false;
            } else if (character == '\\') {
                escaping = true;
            } else if (character == '"') {
                return value.toString();
            } else {
                value.append(character);
            }
        }
        return "";
    }

    private void seedGames() {
        synchronized (games) {
            games.add(new GameState(new GameRow("1", "", "1", "Dettbarn - Fröhlich (1)", "(Freilos)", "Jourdan - Zeising (3)")));
            games.add(new GameState(new GameRow("2", "", "2", "Hamm - Hoppe (9)", "Frei - Herrmann (8)", "Jürgens - Steinbach (6)")));
            games.add(new GameState(new GameRow("3", "", "3", "Kauf - Rudolf (5)", "Flott - Kann (12)", "Stodtmeister - Zander (7)")));
            games.add(new GameState(new GameRow("4", "", "4", "Becker - Seidel (13)", "Dittmann - Heiseke (4)", "Rebmann - Zander (2)")));
            games.add(new GameState(new GameRow("5", "", "1", "Jourdan - Zeising (3)", "Högner - Hönig (14)", "Dettbarn - Fröhlich (1)")));
            games.add(new GameState(new GameRow("6", "", "2", "Koschewski - Scholtz de Oliveira (11)", "Jürgens - Steinbach (6)", "Frei - Herrmann (8)")));
            games.add(new GameState(new GameRow("7", "", "3", "Stodtmeister - Zander (7)", "Fröhlich - Schempp (10)", "Flott - Kann (12)")));
            games.add(new GameState(new GameRow("8", "", "4", "Heinle - Schäfer (15)", "Rebmann - Zander (2)", "Becker - Seidel (13)")));
            games.add(new GameState(new GameRow("9", "", "1", "Dettbarn - Fröhlich (1)", "Hamm - Hoppe (9)", "Högner - Hönig (14)")));
            games.add(new GameState(new GameRow("10", "", "4", "Kauf - Rudolf (5)", "Dittmann - Heiseke (4)", "Heinle - Schäfer (15)")));
            games.add(new GameState(new GameRow("11", "", "2", "Jourdan - Zeising (3)", "Jürgens - Steinbach (6)", "Stodtmeister - Zander (7)")));
            games.add(new GameState(new GameRow("12", "", "1", "Fröhlich - Schempp (10)", "Rebmann - Zander (2)", "Dettbarn - Fröhlich (1)")));
            games.add(new GameState(new GameRow("13", "", "x", "Frei - Herrmann (8)", "(Freilos)", "Dettbarn - Fröhlich (1)")));
            games.add(new GameState(new GameRow("14", "", "2", "Becker - Seidel (13)", "Flott - Kann (12)", "Vorspiel")));
            games.add(new GameState(new GameRow("15", "", "3", "Koschewski - Scholtz de Oliveira (11)", "Högner - Hönig (14)", "Vorspiel")));
            games.add(new GameState(new GameRow("16", "", "1", "Heinle - Schäfer (15)", "Stodtmeister - Zander (7)", "Vorspiel")));
            games.add(new GameState(new GameRow("17", "", "1", "Frei - Herrmann (8)", "Fröhlich - Schempp (10)", "Vorspiel")));
            games.add(new GameState(new GameRow("18", "", "x", "Becker - Seidel (13)", "Jourdan - Zeising (3)", "Vorspiel")));
            games.add(new GameState(new GameRow("19", "", "3", "Koschewski - Scholtz de Oliveira (11)", "Kauf - Rudolf (5)", "Vorspiel")));
            games.add(new GameState(new GameRow("20", "", "2", "Stodtmeister - Zander (7)", "Hamm - Hoppe (9)", "Vorspiel")));
            games.add(new GameState(new GameRow("21", "", "1", "Dettbarn - Fröhlich (1)", "Dittmann - Heiseke (4)", "Vorspiel")));
            games.add(new GameState(new GameRow("22", "", "2", "Jürgens - Steinbach (6)", "Rebmann - Zander (2)", "Vorspiel")));
            games.add(new GameState(new GameRow("23", "", "3", "Becker - Seidel (13)", "Fröhlich - Schempp (10)", "Vorspiel")));
            games.add(new GameState(new GameRow("24", "", "1", "Hamm - Hoppe (9)", "Kauf - Rudolf (5)", "Vorspiel")));
            games.add(new GameState(new GameRow("25", "", "1", "Jürgens - Steinbach (6)", "Hamm - Hoppe (9)", "Vorspiel")));
            games.add(new GameState(new GameRow("26", "", "2", "Dittmann - Heiseke (4)", "Fröhlich - Schempp (10)", "Vorspiel")));
            games.add(new GameState(new GameRow("27", "", "1", "Dettbarn - Fröhlich (1)", "Hamm - Hoppe (9)", "Vorspiel")));
            games.add(new GameState(new GameRow("28", "", "2", "Rebmann - Zander (2)", "Fröhlich - Schempp (10)", "Vorspiel")));
            games.add(new GameState(new GameRow("29", "", "2", "Hamm - Hoppe (9)", "Rebmann - Zander (2)", "")));
            games.add(new GameState(new GameRow("30", "", "1", "Dettbarn - Fröhlich (1)", "Fröhlich - Schempp (10)", "")));
        }
    }

    private String jsonString(String value) {
        if (value == null) {
            return "null";
        }
        StringBuilder builder = new StringBuilder("\"");
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            if (character == '"' || character == '\\') {
                builder.append('\\').append(character);
            } else if (character == '\n') {
                builder.append("\\n");
            } else if (character == '\r') {
                builder.append("\\r");
            } else if (character == '\t') {
                builder.append("\\t");
            } else if (character < 0x20) {
                builder.append(String.format("\\u%04x", (int) character));
            } else {
                builder.append(character);
            }
        }
        return builder.append('"').toString();
    }

    private static class SyncRequest {
        private final String url;
        private final String username;
        private final String password;
        private final boolean ignoreResults;

        private SyncRequest(String url, String username, String password, boolean ignoreResults) {
            this.url = url;
            this.username = username;
            this.password = password;
            this.ignoreResults = ignoreResults;
        }

        private String url() {
            return url;
        }

        private String username() {
            return username;
        }

        private String password() {
            return password;
        }

        private boolean ignoreResults() {
            return ignoreResults;
        }

        private static SyncRequest fromJson(String json) {
            return new SyncRequest(
                    jsonField(json, "url"),
                    jsonField(json, "username"),
                    jsonField(json, "password"),
                    "true".equals(jsonField(json, "ignoreResults")));
        }

    }

    private static class GameState {
        private final String id;
        private final String tournamentId = "local-tournament-1";
        private final String number;
        private final String round;
        private final String date;
        private String court;
        private final String teamA;
        private final String teamB;
        private final List<String> teamAPlayers;
        private final List<String> teamBPlayers;
        private String referee;
        private String result;
        private String winnerTeam;
        private final String editUrl;
        private final String editMethod;
        private final String editData;
        private String gameRating;
        private String set1TeamA;
        private String set1TeamB;
        private String set2TeamA;
        private String set2TeamB;
        private String set3TeamA;
        private String set3TeamB;
        private boolean printed;
        private boolean dirty;
        private boolean completed;
        private String pointHistory = "";
        private String scoreLockedByDevice = "";
        private String scoreLockedAt = "";
        private String scoreBlockedDevice = "";
        private String scoreBlockedUntil = "";

        private GameState(GameRow row) {
            this(row, defaultPlayers(row.teamA()), defaultPlayers(row.teamB()));
        }

        private GameState(GameRow row, List<String> teamAPlayers, List<String> teamBPlayers) {
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

        private static List<String> defaultPlayers(String team) {
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

    private static class LockedGamesResult {
        private final int status;
        private final String error;
        private final List<GameState> games;

        private LockedGamesResult(int status, String error, List<GameState> games) {
            this.status = status;
            this.error = error;
            this.games = games;
        }

        private static LockedGamesResult ok(List<GameState> games) {
            return new LockedGamesResult(200, "", games);
        }

        private static LockedGamesResult error(int status, String error) {
            return new LockedGamesResult(status, error, List.of());
        }
    }

    private static class LinkState {
        private final String id = UUID.randomUUID().toString();
        private final String token = UUID.randomUUID().toString().replace("-", "");
        private final String tournamentId;
        private final String gameId;
        private final String court;
        private final String createdAt = java.time.Instant.now().toString();
        private String usedAt = "";
        private String disabledAt = "";

        private LinkState(String tournamentId, String gameId, String court) {
            this.tournamentId = tournamentId == null ? "" : tournamentId;
            this.gameId = gameId == null ? "" : gameId;
            this.court = court == null ? "" : court;
        }
    }
}
