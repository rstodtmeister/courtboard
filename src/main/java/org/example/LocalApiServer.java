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
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.Map;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class LocalApiServer {
    private final WebPageScraper scraper;
    private final int port;
    private final String adminSessionKey;
    private final List<GameState> games = new ArrayList<>();
    private final List<LinkState> links = new ArrayList<>();
    private final Map<String, CourtLockState> courtLocks = new HashMap<>();

    public LocalApiServer(int port) {
        this.port = port;
        this.scraper = new WebPageScraper();
        this.adminSessionKey = createAdminSessionKey();
        seedGames();
    }

    public void start() throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", port), 0);
        server.createContext("/api/admin-session", this::handleAdminSession);
        server.createContext("/api/health", this::handleHealth);
        server.createContext("/api/games", this::handleGames);
        server.createContext("/api/admin/games", this::handleAdminGames);
        server.createContext("/api/games/update", this::handleUpdateGame);
        server.createContext("/api/games/reorder", this::handleReorderGames);
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
        if (handlePublicCors(exchange)) {
            return;
        }
        if (!"GET".equals(exchange.getRequestMethod())) {
            writeJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }
        writeJson(exchange, 200, "{\"ok\":true}");
    }

    private void handleSyncGames(HttpExchange exchange) throws IOException {
        if (!authorizeAdmin(exchange)) {
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
                synchronized (courtLocks) {
                    courtLocks.clear();
                }
                for (GameRow row : rows) {
                    games.add(new GameState(row));
                }
            }
            writeJson(exchange, 200, LocalApiPayloads.syncResponse(page, rows));
        } catch (Exception exception) {
            writeJson(exchange, 500, "{\"error\":" + LocalApiJson.jsonString(exception.getMessage()) + "}");
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
        if (handlePublicCors(exchange)) {
            return;
        }
        if (!"GET".equals(exchange.getRequestMethod())) {
            writeJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }
        writeJson(exchange, 200, "{\"games\":" + LocalApiPayloads.publicGamesJson(allGames()) + "}");
    }

    private void handleAdminGames(HttpExchange exchange) throws IOException {
        if (!authorizeAdmin(exchange)) {
            return;
        }
        if (!"GET".equals(exchange.getRequestMethod())) {
            writeJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }
        writeJson(exchange, 200, "{\"games\":" + LocalApiPayloads.gamesJson(allGames()) + "}");
    }

    private void handleUpdateGame(HttpExchange exchange) throws IOException {
        if (!authorizeAdmin(exchange)) {
            return;
        }
        if (!"POST".equals(exchange.getRequestMethod())) {
            writeJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        String gameId = LocalApiJson.jsonField(body, "gameId");
        GameState game = findGame(gameId);
        if (game == null) {
            writeJson(exchange, 404, "{\"error\":\"game not found\"}");
            return;
        }
        LocalApiGameUpdates.updateGameFromBody(game, body);
        writeJson(exchange, 200, "{\"game\":" + LocalApiPayloads.gameJson(game) + "}");
    }

    private void handleReorderGames(HttpExchange exchange) throws IOException {
        if (!authorizeAdmin(exchange)) {
            return;
        }
        if (!"POST".equals(exchange.getRequestMethod())) {
            writeJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        List<GameState> updated = new ArrayList<>();
        Matcher matcher = Pattern.compile("\\{[^{}]*\"gameId\"\\s*:\\s*\"([^\"]+)\"[^{}]*\"displayOrder\"\\s*:\\s*(\\d+)[^{}]*}").matcher(body);
        while (matcher.find()) {
            GameState game = findGame(matcher.group(1));
            if (game != null) {
                game.displayOrder = Integer.parseInt(matcher.group(2));
                updated.add(game);
            }
        }
        writeJson(exchange, 200, "{\"games\":" + LocalApiPayloads.gamesJson(updated) + "}");
    }

    private void handleScoreLinks(HttpExchange exchange) throws IOException {
        if (!authorizeAdmin(exchange)) {
            return;
        }
        if ("GET".equals(exchange.getRequestMethod())) {
            writeJson(exchange, 200, "{\"links\":" + LocalApiPayloads.linksJson(allLinks()) + "}");
            return;
        }
        if (!"POST".equals(exchange.getRequestMethod())) {
            writeJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        LinkState link = new LinkState(LocalApiJson.jsonField(body, "tournamentId"), LocalApiJson.jsonField(body, "gameId"), LocalApiJson.jsonField(body, "court"));
        synchronized (links) {
            links.add(link);
        }
        writeJson(exchange, 200, "{\"id\":" + LocalApiJson.jsonString(link.id) + ",\"token\":" + LocalApiJson.jsonString(link.token) + "}");
    }

    private void handleDisableScoreLink(HttpExchange exchange) throws IOException {
        if (!authorizeAdmin(exchange)) {
            return;
        }
        if (!"POST".equals(exchange.getRequestMethod())) {
            writeJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        String linkId = LocalApiJson.jsonField(body, "linkId");
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
        if (handlePublicCors(exchange)) {
            return;
        }
        if (!"GET".equals(exchange.getRequestMethod())) {
            writeJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }
        LinkState link = findActiveLink(LocalApiJson.queryParam(exchange.getRequestURI().getRawQuery(), "token"));
        if (link == null) {
            writeJson(exchange, 404, "{\"error\":\"Ungueltiger Token\"}");
            return;
        }
        String deviceId = LocalApiJson.queryParam(exchange.getRequestURI().getRawQuery(), "deviceId");
        LockedGamesResult result = lockedGamesForDevice(link, deviceId);
        if (!result.error.isBlank()) {
            writeJson(exchange, result.status, "{\"error\":" + LocalApiJson.jsonString(result.error) + "}");
            return;
        }
        writeJson(exchange, 200, "{\"link\":" + LocalApiPayloads.scoreEntryLinkJson(link) + ",\"games\":" + LocalApiPayloads.publicGamesJson(result.games) + ",\"allTeams\":" + LocalApiJson.jsonArray(allTeamNames()) + "}");
    }

    private void handleUnlockScoreEntry(HttpExchange exchange) throws IOException {
        if (!authorizeAdmin(exchange)) {
            return;
        }
        if (!"POST".equals(exchange.getRequestMethod())) {
            writeJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        String gameId = LocalApiJson.jsonField(body, "gameId");
        String tournamentId = LocalApiJson.jsonField(body, "tournamentId");
        String court = LocalApiJson.jsonField(body, "court");
        GameState game = findGame(gameId);
        if (game == null && !court.isBlank()) {
            for (GameState candidate : allGames()) {
                if (candidate.court.equals(court) && (tournamentId.isBlank() || candidate.tournamentId.equals(tournamentId))) {
                    game = candidate;
                    break;
                }
            }
        }
        if (game == null) {
            writeJson(exchange, 404, "{\"error\":\"Court oder Spiel nicht gefunden\"}");
            return;
        }
        clearCourtLock(game);
        writeJson(exchange, 200, "{\"ok\":true}");
    }

    private void handleSubmitScore(HttpExchange exchange) throws IOException {
        if (handlePublicCors(exchange)) {
            return;
        }
        if (!"POST".equals(exchange.getRequestMethod())) {
            writeJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        LinkState link = findActiveLink(LocalApiJson.jsonField(body, "token"));
        if (link == null) {
            writeJson(exchange, 404, "{\"error\":\"Ungueltiger Token\"}");
            return;
        }
        GameState game = findGame(LocalApiJson.jsonField(body, "gameId"));
        if (game == null || !isAllowed(link, game)) {
            writeJson(exchange, 403, "{\"error\":\"Spiel ist fuer diesen Token nicht freigegeben\"}");
            return;
        }
        if (game.completed) {
            writeJson(exchange, 409, "{\"error\":\"Das Spiel ist bereits abgeschlossen.\"}");
            return;
        }
        String deviceId = LocalApiJson.jsonField(body, "deviceId");
        synchronized (courtLocks) {
          synchronized (game) {
            if (deviceId.isBlank()) {
                writeJson(exchange, 403, "{\"error\":\"Dieses Geraet konnte nicht erkannt werden. Bitte Link neu oeffnen.\"}");
                return;
            }
            String courtError = acquireCourtLock(game, deviceId);
            if (!courtError.isBlank()) {
                writeJson(exchange, 423, "{\"error\":" + LocalApiJson.jsonString(courtError) + "}");
                return;
            }
            if (!game.scoreLockedByDevice.isBlank() && !game.scoreLockedByDevice.equals(deviceId)) {
                writeJson(exchange, 423, "{\"error\":\"Dieses Spiel wird bereits auf einem anderen Geraet erfasst.\"}");
                return;
            }
            try {
                ScoreSubmissionValidator.validateAndApply(game, body);
            } catch (IllegalArgumentException exception) {
                writeJson(exchange, 400, "{\"error\":" + LocalApiJson.jsonString(exception.getMessage()) + "}");
                return;
            }
            if (game.completed && !game.court.isBlank()) {
                completeCourtLock(game, deviceId);
            }
            if (game.scoreLockedByDevice.isBlank() && !game.completed) {
                game.scoreLockedByDevice = deviceId;
                game.scoreLockedAt = java.time.Instant.now().toString();
            }
          }
        }
        link.usedAt = java.time.Instant.now().toString();
        writeJson(exchange, 200, "{\"ok\":true}");
    }

    private void completeCourtLock(GameState completedGame, String deviceId) {
        CourtLockState lock = courtLocks.computeIfAbsent(courtKey(completedGame), ignored -> new CourtLockState());
        lock.activeGameId = "";
        lock.activeDeviceId = "";
        lock.lockedAt = null;
        lock.blockedDeviceId = deviceId;
        lock.blockedUntil = java.time.Instant.now().plusSeconds(5 * 60);
        clearLegacyCourtState(completedGame);
        List<GameState> candidates = allGames();
        candidates.sort(Comparator
                .comparingInt((GameState game) -> gameOrderSortKey(game))
                .thenComparing(game -> game.number, String.CASE_INSENSITIVE_ORDER));
        for (GameState candidate : candidates) {
            if (!candidate.tournamentId.equals(completedGame.tournamentId) || !candidate.court.equals(completedGame.court)) {
                continue;
            }
            if (candidate == completedGame || candidate.completed) {
                continue;
            }
            synchronized (candidate) {
                candidate.scoreBlockedDevice = deviceId;
                candidate.scoreBlockedUntil = java.time.Instant.now().plusSeconds(5 * 60).toString();
            }
            return;
        }
    }

    private void handleQr(HttpExchange exchange) throws IOException {
        if (handlePublicCors(exchange)) {
            return;
        }
        if (!"GET".equals(exchange.getRequestMethod())) {
            writeJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }

        String value = LocalApiJson.queryParam(exchange.getRequestURI().getRawQuery(), "value");
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

    private void handleAdminSession(HttpExchange exchange) throws IOException {
        if (handleAdminCors(exchange)) {
            return;
        }
        if (!"GET".equals(exchange.getRequestMethod())) {
            writeJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }
        if (!exchange.getRemoteAddress().getAddress().isLoopbackAddress()) {
            writeJson(exchange, 403, "{\"error\":\"Admin session is only available on this computer\"}");
            return;
        }
        writeJson(exchange, 200, "{\"key\":" + LocalApiJson.jsonString(adminSessionKey) + "}");
    }

    private boolean authorizeAdmin(HttpExchange exchange) throws IOException {
        if (handleAdminCors(exchange)) {
            return false;
        }
        String suppliedKey = exchange.getRequestHeaders().getFirst("X-CourtBoard-Admin-Key");
        if (!secureEquals(adminSessionKey, suppliedKey)) {
            writeJson(exchange, 401, "{\"error\":\"Lokale Admin-Sitzung fehlt oder ist abgelaufen\"}");
            return false;
        }
        return true;
    }

    private boolean handlePublicCors(HttpExchange exchange) throws IOException {
        Headers headers = exchange.getResponseHeaders();
        headers.set("Access-Control-Allow-Origin", "*");
        headers.set("Access-Control-Allow-Headers", "content-type");
        headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        if ("OPTIONS".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return true;
        }
        return false;
    }

    private boolean handleAdminCors(HttpExchange exchange) throws IOException {
        String origin = exchange.getRequestHeaders().getFirst("Origin");
        if (origin != null && !origin.isBlank()) {
            if (!isTrustedLocalOrigin(origin)) {
                writeJson(exchange, 403, "{\"error\":\"Origin is not allowed for local admin access\"}");
                return true;
            }
            Headers headers = exchange.getResponseHeaders();
            headers.set("Access-Control-Allow-Origin", origin);
            headers.set("Vary", "Origin");
            headers.set("Access-Control-Allow-Headers", "content-type,x-courtboard-admin-key");
            headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        }
        if ("OPTIONS".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return true;
        }
        return false;
    }

    private boolean isTrustedLocalOrigin(String origin) {
        try {
            java.net.URI uri = java.net.URI.create(origin);
            if (!("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()))) {
                return false;
            }
            String host = uri.getHost();
            if (host == null) {
                return false;
            }
            return "localhost".equalsIgnoreCase(host) || "::1".equals(host) || host.startsWith("127.");
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private static String createAdminSessionKey() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static boolean secureEquals(String expected, String supplied) {
        if (supplied == null) {
            return false;
        }
        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                supplied.getBytes(StandardCharsets.UTF_8));
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

    private List<GameState> allGames() {
        synchronized (games) {
            return new ArrayList<>(games);
        }
    }

    private List<LinkState> allLinks() {
        synchronized (links) {
            return new ArrayList<>(links);
        }
    }

    private List<String> allTeamNames() {
        java.util.TreeSet<String> teams = new java.util.TreeSet<>(Comparator
                .comparing(LocalApiServer::isUnresolvedTeamReference)
                .thenComparing(String.CASE_INSENSITIVE_ORDER));
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

    private static boolean isUnresolvedTeamReference(String value) {
        String normalized = value == null ? "" : value.trim();
        return normalized.matches("(?i).*\\b(?:gewinner|sieger|verlierer)\\s+(?:(?:aus|von)\\s+)?(?:spiel|match|partie)\\b.*")
                || normalized.matches("(?i).*\\b(?:pool|gruppe)\\s+[a-z0-9-]+\\s+(?:platz|rang)\\s*\\d+\\b.*")
                || normalized.matches("(?i).*\\b(?:platz|rang)\\s*\\d+\\s+(?:(?:aus|von)\\s+)?(?:pool|gruppe)\\b.*");
    }

    private List<GameState> allowedGames(LinkState link) {
        List<GameState> result = new ArrayList<>();
        for (GameState game : allGames()) {
            if (isAllowed(link, game)) {
                result.add(game);
            }
        }
        result.sort(Comparator
                .comparingInt((GameState game) -> gameOrderSortKey(game))
                .thenComparing(game -> game.number, String.CASE_INSENSITIVE_ORDER));
        return result;
    }

    private static int gameOrderSortKey(GameState game) {
        return game.displayOrder > 0 ? game.displayOrder : gameNumberSortKey(game.number);
    }

    private static int gameNumberSortKey(String number) {
        if (number == null || number.isBlank()) {
            return Integer.MAX_VALUE;
        }
        for (int index = 0; index < number.length(); index++) {
            char character = number.charAt(index);
            if (Character.isDigit(character)) {
                int end = index + 1;
                while (end < number.length() && Character.isDigit(number.charAt(end))) {
                    end++;
                }
                try {
                    return Integer.parseInt(number.substring(index, end));
                } catch (NumberFormatException ignored) {
                    return Integer.MAX_VALUE;
                }
            }
        }
        return Integer.MAX_VALUE;
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

        synchronized (courtLocks) {
            synchronized (game) {
                String courtError = acquireCourtLock(game, deviceId);
                if (!courtError.isBlank()) {
                    return LockedGamesResult.error(423, courtError);
                }
            }
        }
        return LockedGamesResult.ok(List.of(game));
    }

    private String acquireCourtLock(GameState game, String deviceId) {
        CourtLockState lock = courtLocks.computeIfAbsent(courtKey(game), ignored -> new CourtLockState());
        java.time.Instant now = java.time.Instant.now();
        if (deviceId.equals(lock.blockedDeviceId) && lock.blockedUntil != null && now.isBefore(lock.blockedUntil)) {
            return "Keine Eingabe moeglich. Bitte beim Admin melden.";
        }
        boolean active = lock.lockedAt != null && now.isBefore(lock.lockedAt.plusSeconds(30 * 60));
        if (active && (!deviceId.equals(lock.activeDeviceId) || !game.id.equals(lock.activeGameId))) {
            return "Dieser Court wird bereits auf einem anderen Geraet erfasst.";
        }
        clearLegacyCourtState(game);
        lock.activeGameId = game.id;
        lock.activeDeviceId = deviceId;
        lock.lockedAt = now;
        lock.blockedDeviceId = "";
        lock.blockedUntil = null;
        game.scoreLockedByDevice = deviceId;
        game.scoreLockedAt = now.toString();
        return "";
    }

    private void clearCourtLock(GameState game) {
        synchronized (courtLocks) {
            courtLocks.remove(courtKey(game));
            clearLegacyCourtState(game);
        }
    }

    private void clearLegacyCourtState(GameState game) {
        for (GameState candidate : allGames()) {
            if (candidate.tournamentId.equals(game.tournamentId) && candidate.court.equals(game.court)) {
                candidate.scoreLockedByDevice = "";
                candidate.scoreLockedAt = "";
                candidate.scoreBlockedDevice = "";
                candidate.scoreBlockedUntil = "";
            }
        }
    }

    private static String courtKey(GameState game) {
        return game.tournamentId + "\u0000" + game.court.trim();
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

    private static final class CourtLockState {
        String activeGameId = "";
        String activeDeviceId = "";
        java.time.Instant lockedAt;
        String blockedDeviceId = "";
        java.time.Instant blockedUntil;
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

}
