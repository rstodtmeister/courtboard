package org.example;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class CourtDisplayWriter {
    private static final int[] COURTS = {1, 2, 3, 4};
    private static final Pattern RESULT_WIN_PATTERN = Pattern.compile("(\\d+)\\s*[:\\-]\\s*(\\d+)");
    private static final Comparator<GameRow> GAME_NUMBER_COMPARATOR =
            Comparator.comparingInt((GameRow game) -> gameNumberSortKey(game.number()))
                    .thenComparing(GameRow::number, String.CASE_INSENSITIVE_ORDER);

    public Path write(List<GameRow> games, Path outputFile, String hvvScheduleUrl, Instant generatedAt) throws IOException {
        return write(games, outputFile, hvvScheduleUrl, generatedAt, true);
    }

    public Path write(List<GameRow> games, Path outputFile, String hvvScheduleUrl, Instant generatedAt, boolean browserRefresh) throws IOException {
        Path absoluteOutputFile = outputFile.toAbsolutePath();
        Path parent = absoluteOutputFile.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }

        Files.writeString(absoluteOutputFile, html(games, hvvScheduleUrl, generatedAt, browserRefresh), StandardCharsets.UTF_8);
        return absoluteOutputFile;
    }

    private String html(List<GameRow> games, String hvvScheduleUrl, Instant generatedAt, boolean browserRefresh) {
        List<GameRow> sortedGames = sortedByGameNumber(games);
        StringBuilder builder = new StringBuilder();
        builder.append("""
                <!doctype html>
                <html lang="de">
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1">
                """);
        if (browserRefresh) {
            builder.append("  <meta http-equiv=\"refresh\" content=\"10\">\n");
        }
        builder.append("""
                  <title>Court Anzeige</title>
                  <style>
                    :root {
                      color-scheme: light;
                      --side-title-size: clamp(18px, 2.4vmin, 28px);
                      --side-item-size: clamp(10px, 1.35vmin, 15px);
                      --outer-gap: clamp(14px, 2vmin, 30px);
                    }
                    * { box-sizing: border-box; }
                    body {
                      margin: 0;
                      font-family: Arial, Helvetica, sans-serif;
                      background: #ffffff;
                      color: #000000;
                      height: 100vh;
                      overflow: hidden;
                      display: grid;
                      grid-template-columns: minmax(0, 1fr) max-content;
                      gap: var(--outer-gap);
                      padding: var(--outer-gap);
                    }
                    main {
                      display: grid;
                      grid-template-columns: repeat(2, minmax(0, 1fr));
                      grid-template-rows: repeat(2, minmax(0, 1fr));
                      gap: var(--outer-gap);
                      min-height: 0;
                    }
                    section {
                      background: #ffffff;
                      border: 4px solid #000000;
                      border-radius: 0;
                      display: flex;
                      flex-direction: column;
                      min-height: 0;
                      overflow: hidden;
                    }
                    .court-section {
                      container-type: size;
                    }
                    .court-heading {
                      display: flex;
                      justify-content: center;
                      align-items: center;
                      padding: clamp(8px, 4cqh, 20px) clamp(10px, 4cqw, 24px);
                      background: #1f1f1f;
                      color: #ffffff;
                      border-bottom: 4px solid #000000;
                      flex: 0 0 auto;
                    }
                    .court-heading h2 {
                      margin: 0;
                      font-size: clamp(42px, 13cqw, 96px);
                      font-weight: 900;
                      letter-spacing: 0;
                      line-height: .92;
                    }
                    .count {
                      font-size: clamp(11px, 3cqw, 18px);
                    }
                    .games {
                      display: grid;
                      grid-template-rows: minmax(0, 2.2fr) minmax(0, .9fr) minmax(0, .9fr);
                      flex: 1;
                      min-height: 0;
                    }
                    .label {
                      text-transform: uppercase;
                      letter-spacing: 0;
                      color: #000000;
                      font-weight: 700;
                      font-size: clamp(10px, 2.6cqw, 18px);
                      margin-bottom: clamp(3px, 1.6cqh, 9px);
                    }
                    .game {
                      display: flex;
                      flex-direction: column;
                      justify-content: center;
                      min-height: 0;
                      padding: clamp(5px, 2.2cqh, 14px) clamp(10px, 4cqw, 26px);
                      border-top: 3px solid #000000;
                      overflow: hidden;
                    }
                    .game:first-child { border-top: 0; }
                    .game.current {
                      border-bottom: 6px solid #000000;
                      padding-top: clamp(10px, 4cqh, 26px);
                      padding-bottom: clamp(10px, 4cqh, 26px);
                    }
                    .game.current .teams {
                      font-size: clamp(28px, 9.4cqw, 88px);
                      font-weight: 900;
                      line-height: .98;
                    }
                    .game.next {
                      background: #f7f7f7;
                    }
                    .game.next .label {
                      display: flex;
                      align-items: center;
                      flex-wrap: wrap;
                      gap: .45em;
                      font-size: clamp(9px, 2.2cqw, 15px);
                      margin-bottom: clamp(2px, .9cqh, 5px);
                    }
                    .game-number-badge {
                      display: inline-block;
                      background: #3a3a3a;
                      color: #ffffff;
                      padding: .14em .38em;
                      font-weight: 800;
                      line-height: 1.05;
                    }
                    .current-game-number {
                      text-align: center;
                      font-size: clamp(16px, 4.5cqw, 32px);
                      margin-bottom: clamp(4px, 1.4cqh, 10px);
                    }
                    .game.next .teams {
                      font-size: clamp(20px, 5.9cqw, 48px);
                      font-weight: 900;
                      line-height: 1.1;
                      padding-bottom: .08em;
                    }
                    .game.next .details {
                      font-size: clamp(8px, 2cqw, 14px);
                      margin-top: clamp(2px, .7cqh, 5px);
                    }
                    .game.current .referee-detail {
                      font-size: clamp(16px, 4.5cqw, 32px);
                    }
                    .game.next .referee-detail {
                      font-size: clamp(12px, 2.8cqw, 20px);
                    }
                    .teams {
                      font-size: clamp(14px, 4.2cqw, 34px);
                      line-height: 1;
                      font-weight: 700;
                      overflow-wrap: anywhere;
                      overflow: hidden;
                    }
                    .team-line + .team-line {
                      margin-top: clamp(6px, 2.4cqh, 24px);
                    }
                    .details {
                      display: flex;
                      flex-wrap: wrap;
                      gap: clamp(4px, 1.4cqh, 10px) clamp(8px, 3cqw, 18px);
                      margin-top: clamp(4px, 1.8cqh, 12px);
                      color: #000000;
                      font-size: clamp(10px, 2.8cqw, 18px);
                      overflow-wrap: anywhere;
                      overflow: hidden;
                    }
                    .referee-detail {
                      display: inline-flex;
                      align-items: center;
                      gap: .35em;
                      font-weight: 800;
                      line-height: 1.05;
                    }
                    .referee-icon {
                      width: 2.1em;
                      height: 1.4em;
                      flex: 0 0 auto;
                    }
                    .fit-text {
                      max-width: 100%;
                    }
                    .empty {
                      margin: auto;
                      padding: 20px;
                      color: #000000;
                      font-size: clamp(22px, 2.5vw, 34px);
                      text-align: center;
                      font-weight: 700;
                    }
                    .side-panel {
                      display: grid;
                      grid-template-rows: max-content max-content 1fr;
                      gap: var(--outer-gap);
                      min-height: 0;
                      width: max-content;
                      align-items: stretch;
                      overflow: visible;
                    }
                    .side-box {
                      border: 4px solid #000000;
                      padding: clamp(8px, 1.2vmin, 14px);
                      background: #ffffff;
                      overflow: visible;
                      min-height: 0;
                      width: auto;
                      min-width: 100%;
                    }
                    .side-box h2 {
                      margin: 0 0 clamp(6px, 1vmin, 12px);
                      font-size: var(--side-title-size);
                      line-height: 1;
                      font-weight: 900;
                    }
                    .side-list {
                      display: grid;
                      grid-template-columns: 1fr;
                      gap: clamp(3px, .6vmin, 7px) clamp(8px, 1.2vmin, 14px);
                      min-height: 0;
                      overflow: hidden;
                    }
                    .side-item {
                      min-width: 0;
                      white-space: nowrap;
                      overflow: hidden;
                      text-overflow: ellipsis;
                      font-size: var(--side-item-size);
                      line-height: 1.12;
                      font-weight: 500;
                    }
                    .open-list {
                      display: grid;
                      grid-template-columns: max-content max-content max-content max-content;
                      gap: clamp(3px, .55vmin, 6px) clamp(8px, 1.1vmin, 14px);
                      font-size: var(--side-item-size);
                      line-height: 1.12;
                      width: max-content;
                      min-width: 100%;
                    }
                    .open-header {
                      font-weight: 900;
                      border-bottom: 2px solid #000000;
                      padding-bottom: 2px;
                      white-space: nowrap;
                    }
                    .open-cell {
                      white-space: nowrap;
                      font-weight: 700;
                    }
                    .winner {
                      font-weight: 900;
                    }
                    .result-score {
                      font-weight: 900;
                    }
                    .qr-panel {
                      display: flex;
                      align-items: center;
                      align-self: end;
                      gap: clamp(8px, 1.2vmin, 14px);
                      border: 4px solid #000000;
                      padding: clamp(8px, 1.2vmin, 14px);
                      background: #ffffff;
                      font-size: var(--side-item-size);
                      font-weight: 700;
                      width: 100%;
                    }
                    .qr-code {
                      width: clamp(72px, 9vmin, 120px);
                      height: clamp(72px, 9vmin, 120px);
                      flex: 0 0 auto;
                    }
                    .qr-code svg {
                      display: block;
                      width: 100%;
                      height: 100%;
                      image-rendering: crisp-edges;
                    }
                    @media (max-width: 860px) {
                      body {
                        overflow: auto;
                        height: auto;
                        display: block;
                      }
                      main {
                        grid-template-columns: 1fr;
                        grid-template-rows: none;
                        height: auto;
                      }
                      section { min-height: 42vh; }
                      .side-panel {
                        display: block;
                        padding: 0 var(--outer-gap) var(--outer-gap);
                      }
                      .side-box + .side-box { margin-top: var(--outer-gap); }
                    }
                  </style>
                </head>
                <body>
                """);

        builder.append("  <main>\n");
        for (int court : COURTS) {
            appendCourt(builder, court, gamesForCourt(sortedGames, court));
        }
        builder.append("  </main>\n");
        builder.append("  <aside class=\"side-panel\">\n");
        appendOpenGames(builder, openGames(sortedGames));
        appendResults(builder, completedGames(sortedGames));
        appendQrCode(builder, hvvScheduleUrl);
        builder.append("  </aside>\n");
        builder.append("""
                  <script>
                    (() => {
                      const fitElement = (element) => {
                        element.style.fontSize = '';
                        const computed = window.getComputedStyle(element);
                        const maxSize = parseFloat(computed.fontSize);
                        const minSize = element.closest('.next') && element.classList.contains('teams')
                          ? 15
                          : element.classList.contains('details') ? 8 : 10;
                        if (!maxSize || element.clientWidth <= 0 || element.clientHeight <= 0) {
                          return;
                        }

                        const fits = () =>
                          element.scrollWidth <= element.clientWidth + 1 &&
                          element.scrollHeight <= element.clientHeight + 1;

                        if (fits()) {
                          return;
                        }

                        let low = minSize;
                        let high = maxSize;
                        for (let step = 0; step < 14; step++) {
                          const middle = (low + high) / 2;
                          element.style.fontSize = `${middle}px`;
                          if (fits()) {
                            low = middle;
                          } else {
                            high = middle;
                          }
                        }
                        element.style.fontSize = `${Math.max(minSize, low - 0.5)}px`;
                      };

                      const fitGame = (game) => {
                        const fitted = Array.from(game.querySelectorAll('.fit-text'));
                        for (let step = 0; step < 18; step++) {
                          const overflowing =
                            game.scrollHeight > game.clientHeight + 1 ||
                            game.scrollWidth > game.clientWidth + 1;
                          if (!overflowing) {
                            return;
                          }

                          let changed = false;
                          fitted.forEach((element) => {
                            const minSize = element.closest('.next') && element.classList.contains('teams')
                              ? 15
                              : element.classList.contains('details') ? 8 : 10;
                            const current = parseFloat(window.getComputedStyle(element).fontSize);
                            if (current > minSize) {
                              element.style.fontSize = `${Math.max(minSize, current * 0.93)}px`;
                              changed = true;
                            }
                          });
                          if (!changed) {
                            return;
                          }
                        }
                      };

                      const fitAll = () => {
                        document.querySelectorAll('.game .fit-text').forEach(fitElement);
                        document.querySelectorAll('.game').forEach(fitGame);
                      };

                      window.addEventListener('load', fitAll);
                      window.addEventListener('resize', fitAll);
                      if ('ResizeObserver' in window) {
                        const observer = new ResizeObserver(fitAll);
                        document.querySelectorAll('section, .game').forEach((element) => observer.observe(element));
                      }
                      requestAnimationFrame(fitAll);
                    })();
                  </script>
                </body>
                </html>
                """);
        return builder.toString();
    }

    private void appendOpenGames(StringBuilder builder, List<GameRow> openGames) {
        builder.append("    <section class=\"side-box\">\n");
        builder.append("      <h2>Offene Spiele</h2>\n");
        if (openGames.isEmpty()) {
            builder.append("      <div class=\"side-list\"><div class=\"side-item\">Keine offenen Spiele</div></div>\n");
        } else {
            builder.append("      <div class=\"open-list\">\n");
            builder.append("        <div class=\"open-header\">Nr.</div><div class=\"open-header\">Court</div><div class=\"open-header\">Spiel</div><div class=\"open-header\">Schiri</div>\n");
            for (GameRow game : openGames) {
                appendOpenGameRow(builder, game);
            }
            builder.append("      </div>\n");
        }
        builder.append("    </section>\n");
    }

    private void appendResults(StringBuilder builder, List<GameRow> completedGames) {
        builder.append("    <section class=\"side-box\">\n");
        builder.append("      <h2>Ergebnisse</h2>\n");
        if (completedGames.isEmpty()) {
            builder.append("      <div class=\"side-list\"><div class=\"side-item\">Noch keine Ergebnisse</div></div>\n");
        } else {
            builder.append("      <div class=\"side-list\">\n");
            for (GameRow game : completedGames) {
                appendResultItem(builder, game);
            }
            builder.append("      </div>\n");
        }
        builder.append("    </section>\n");
    }

    private void appendQrCode(StringBuilder builder, String hvvScheduleUrl) {
        if (hvvScheduleUrl == null || hvvScheduleUrl.isBlank()) {
            builder.append("    <div class=\"qr-panel\">Keine HVV Spielplan URL für QR-Code eingetragen</div>\n");
            return;
        }
        builder.append("    <div class=\"qr-panel\"><div class=\"qr-code\" aria-label=\"QR-Code HVV Spielplan\">")
                .append(qrSvg(hvvScheduleUrl))
                .append("</div><div>HVV Spielplan</div></div>\n");
    }

    private String qrSvg(String value) {
        try {
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
                        svg.append('M')
                                .append(x)
                                .append(' ')
                                .append(y)
                                .append("h1v1h-1z");
                    }
                }
            }
            svg.append("\"/></svg>");
            return svg.toString();
        } catch (WriterException exception) {
            return "QR-Code konnte nicht erzeugt werden";
        }
    }

    private void appendOpenGameRow(StringBuilder builder, GameRow game) {
        builder.append("        <div class=\"open-cell\">")
                .append(escape(game.number()))
                .append("</div><div class=\"open-cell\">")
                .append(escape(game.court()))
                .append("</div><div class=\"open-cell\">")
                .append(escape(teamLine(game)))
                .append("</div><div class=\"open-cell\">")
                .append(escape(game.referee()))
                .append("</div>\n");
    }

    private void appendResultItem(StringBuilder builder, GameRow game) {
        int winner = game.winnerTeam() > 0 ? game.winnerTeam() : winnerIndex(game.result());
        builder.append("        <div class=\"side-item\">");
        if (!game.number().isBlank()) {
            builder.append("Nr. ")
                    .append(escape(game.number()))
                    .append(" ");
        }
        appendResultTeam(builder, game.teamA().isBlank() ? "Team A offen" : game.teamA(), winner == 1);
        builder.append(" vs. ");
        appendResultTeam(builder, game.teamB().isBlank() ? "Team B offen" : game.teamB(), winner == 2);
        if (!game.result().isBlank()) {
            builder.append(" <span class=\"result-score\">")
                    .append(escape(game.result()))
                    .append("</span>");
        }
        builder.append("</div>\n");
    }

    private void appendResultTeam(StringBuilder builder, String team, boolean winner) {
        builder.append(winner ? "<strong" : "<span");
        if (winner) {
            builder.append(" class=\"winner\"");
        }
        builder.append(">")
                .append(escape(team))
                .append(winner ? "</strong>" : "</span>");
    }

    private void appendCourt(StringBuilder builder, int court, List<GameRow> games) {
        builder.append("    <section class=\"court-section\">\n");
        builder.append("      <div class=\"court-heading\"><h2>Court ")
                .append(court)
                .append("</h2></div>\n");

        if (games.isEmpty()) {
            builder.append("      <div class=\"empty\">Kein Spiel eingetragen</div>\n");
            builder.append("    </section>\n");
            return;
        }

        builder.append("      <div class=\"games\">\n");
        for (int index = 0; index < 3; index++) {
            if (index < games.size()) {
                appendGame(builder, games.get(index), index + 1);
            } else {
                builder.append("        <div class=\"game\"><div class=\"empty\">Kein weiteres Spiel</div></div>\n");
            }
        }
        builder.append("      </div>\n");
        builder.append("    </section>\n");
    }

    private void appendGame(StringBuilder builder, GameRow game, int position) {
        builder.append("        <div class=\"game")
                .append(position == 1 ? " current" : "")
                .append(position > 1 ? " next" : "")
                .append("\">\n");
        if (position > 1) {
            builder.append("          <div class=\"label\">")
                    .append(position == 2 ? "Nächstes Spiel" : "Übernächstes Spiel")
                    .append(gameNumberLabel(game.number()))
                    .append("</div>\n");
        }
        if (position == 1) {
            builder.append(currentGameNumber(game.number()));
            appendCurrentTeams(builder, game);
        } else {
            builder.append("          <div class=\"teams fit-text\">")
                    .append(escape(teamLine(game)))
                    .append("</div>\n");
        }
        builder.append("          <div class=\"details fit-text\">")
                .append(refereeDetail(game.referee()))
                .append("</div>\n");
        builder.append("        </div>\n");
    }

    private List<GameRow> gamesForCourt(List<GameRow> games, int court) {
        List<GameRow> result = new ArrayList<>();
        for (GameRow game : games) {
            if (!game.isCompleted() && court == courtNumber(game.court())) {
                result.add(game);
            }
        }
        result.sort(GAME_NUMBER_COMPARATOR);
        if (result.size() > 3) {
            return new ArrayList<>(result.subList(0, 3));
        }
        return result;
    }

    private List<GameRow> completedGames(List<GameRow> games) {
        List<GameRow> result = new ArrayList<>();
        for (GameRow game : games) {
            if (game.isCompleted()) {
                result.add(game);
            }
        }
        result.sort(GAME_NUMBER_COMPARATOR);
        return result;
    }

    private List<GameRow> openGames(List<GameRow> games) {
        List<GameRow> result = new ArrayList<>();
        for (GameRow game : games) {
            if (!game.isCompleted()) {
                result.add(game);
            }
        }
        result.sort(GAME_NUMBER_COMPARATOR);
        return result;
    }

    private List<GameRow> sortedByGameNumber(List<GameRow> games) {
        List<GameRow> sortedGames = new ArrayList<>(games);
        sortedGames.sort(GAME_NUMBER_COMPARATOR);
        return sortedGames;
    }

    private static int gameNumberSortKey(String number) {
        if (number == null || number.isBlank()) {
            return Integer.MAX_VALUE;
        }
        StringBuilder digits = new StringBuilder();
        for (int index = 0; index < number.length(); index++) {
            char character = number.charAt(index);
            if (Character.isDigit(character)) {
                digits.append(character);
            } else if (digits.length() > 0) {
                break;
            }
        }
        if (digits.length() == 0) {
            return Integer.MAX_VALUE;
        }
        try {
            return Integer.parseInt(digits.toString());
        } catch (NumberFormatException exception) {
            return Integer.MAX_VALUE;
        }
    }

    private int courtNumber(String court) {
        if (court == null) {
            return -1;
        }
        StringBuilder digits = new StringBuilder();
        for (int index = 0; index < court.length(); index++) {
            char character = court.charAt(index);
            if (Character.isDigit(character)) {
                digits.append(character);
            } else if (digits.length() > 0) {
                break;
            }
        }
        if (digits.length() == 0) {
            return -1;
        }
        try {
            return Integer.parseInt(digits.toString());
        } catch (NumberFormatException exception) {
            return -1;
        }
    }

    private String gameNumberLabel(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        return "<span class=\"game-number-badge\">Spiel Nr. " + escape(value) + "</span>";
    }

    private String currentGameNumber(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        return "          <div class=\"current-game-number fit-text\"><span class=\"game-number-badge\">Spiel Nr. " + escape(value) + "</span></div>\n";
    }

    private String refereeDetail(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        return """
                <span class="referee-detail"><svg class="referee-icon" viewBox="360 220 820 580" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><path d="M 1142.0 276.0 L 1118.0 252.0 L 1074.0 242.0 L 1045.0 252.0 L 1011.0 287.0 L 940.0 246.0 L 892.0 235.0 L 823.0 241.0 L 752.0 269.0 L 642.0 349.0 L 388.0 565.0 L 398.0 657.0 L 570.0 776.0 L 811.0 624.0 L 875.0 665.0 L 923.0 682.0 L 982.0 679.0 L 1032.0 659.0 L 1096.0 605.0 L 1135.0 533.0 L 1144.0 446.0 L 1118.0 372.0 L 1150.0 329.0 Z M 1036.0 330.0 L 974.0 337.0 L 907.0 370.0 L 558.0 668.0 L 415.0 572.0 L 693.0 336.0 L 747.0 297.0 L 797.0 272.0 L 860.0 257.0 L 916.0 261.0 L 962.0 282.0 Z M 1075.0 367.0 L 1100.0 389.0 L 1109.0 403.0 L 1121.0 437.0 L 1124.0 464.0 L 1116.0 522.0 L 1090.0 577.0 L 1072.0 600.0 L 1046.0 624.0 L 1022.0 640.0 L 991.0 654.0 L 966.0 660.0 L 931.0 661.0 L 904.0 655.0 L 879.0 642.0 L 852.0 613.0 L 839.0 583.0 L 834.0 554.0 L 840.0 498.0 L 850.0 470.0 L 867.0 440.0 L 912.0 393.0 L 937.0 376.0 L 967.0 362.0 L 1003.0 353.0 L 1033.0 353.0 L 1053.0 357.0 Z M 826.0 468.0 L 813.0 530.0 L 814.0 567.0 L 822.0 601.0 L 809.0 601.0 L 799.0 605.0 L 579.0 748.0 L 569.0 687.0 Z M 678.0 379.0 L 680.0 384.0 L 780.0 441.0 L 788.0 440.0 L 833.0 402.0 L 837.0 397.0 L 836.0 393.0 L 829.0 388.0 L 735.0 336.0 L 728.0 337.0 L 680.0 375.0 Z M 411.0 598.0 L 413.0 597.0 L 545.0 686.0 L 548.0 693.0 L 554.0 737.0 L 551.0 738.0 L 419.0 647.0 L 416.0 636.0 Z M 1068.0 266.0 L 1083.0 264.0 L 1084.0 265.0 L 1090.0 265.0 L 1104.0 271.0 L 1119.0 285.0 L 1126.0 298.0 L 1129.0 309.0 L 1129.0 317.0 L 1128.0 318.0 L 1126.0 330.0 L 1119.0 342.0 L 1113.0 348.0 L 1103.0 354.0 L 1100.0 354.0 L 1087.0 341.0 L 1075.0 331.0 L 1034.0 302.0 L 1034.0 299.0 L 1042.0 285.0 L 1052.0 275.0 Z" fill="currentColor" fill-rule="evenodd"/></svg> """
                + escape(value) + "</span>";
    }

    private String teamLine(GameRow game) {
        String teamA = game.teamA().isBlank() ? "Team A offen" : game.teamA();
        String teamB = game.teamB().isBlank() ? "Team B offen" : game.teamB();
        return teamA + " vs. " + teamB;
    }

    private int winnerIndex(String result) {
        Matcher matcher = RESULT_WIN_PATTERN.matcher(result == null ? "" : result);
        if (!matcher.find()) {
            return 0;
        }
        try {
            int teamAResult = Integer.parseInt(matcher.group(1));
            int teamBResult = Integer.parseInt(matcher.group(2));
            if (isMatchResult(teamAResult, teamBResult)) {
                return winnerFromPair(teamAResult, teamBResult);
            }

            int teamAWonSets = 0;
            int teamBWonSets = 0;
            int winner = winnerFromPair(teamAResult, teamBResult);
            if (winner == 1) {
                teamAWonSets++;
            } else if (winner == 2) {
                teamBWonSets++;
            }
            while (matcher.find()) {
                winner = winnerFromPair(Integer.parseInt(matcher.group(1)), Integer.parseInt(matcher.group(2)));
                if (winner == 1) {
                    teamAWonSets++;
                } else if (winner == 2) {
                    teamBWonSets++;
                }
            }
            return winnerFromPair(teamAWonSets, teamBWonSets);
        } catch (NumberFormatException exception) {
            return 0;
        }
    }

    private boolean isMatchResult(int teamAResult, int teamBResult) {
        return teamAResult <= 3 && teamBResult <= 3 && (teamAResult == 2 || teamBResult == 2);
    }

    private int winnerFromPair(int teamAResult, int teamBResult) {
        if (teamAResult > teamBResult) {
                return 1;
        }
        if (teamBResult > teamAResult) {
                return 2;
        }
        return 0;
    }

    private void appendCurrentTeams(StringBuilder builder, GameRow game) {
        String teamA = game.teamA().isBlank() ? "Team A offen" : game.teamA();
        String teamB = game.teamB().isBlank() ? "Team B offen" : game.teamB();
        builder.append("          <div class=\"teams fit-text\">")
                .append("<div class=\"team-line\">")
                .append(escape(teamA))
                .append("</div><div class=\"team-line\">")
                .append(escape(teamB))
                .append("</div></div>\n");
    }

    private String escape(String value) {
        if (value == null) {
            return "";
        }
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }
}
