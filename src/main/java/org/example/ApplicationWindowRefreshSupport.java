package org.example;

import javax.swing.JOptionPane;
import javax.swing.SwingWorker;
import javax.swing.Timer;
import javax.swing.table.DefaultTableModel;
import javax.swing.table.TableRowSorter;
import java.awt.Component;
import java.io.IOException;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.function.Consumer;

final class ApplicationWindowRefreshSupport {
    private ApplicationWindowRefreshSupport() {
    }

    static void startCourtDisplay(
            ScrapedPage scrapedPage,
            List<RowSelection> rows,
            DefaultTableModel tableModel,
            TableRowSorter<DefaultTableModel> sorter,
            SelectionControls controls,
            Component parent,
            Path courtDisplayFile,
            int refreshMillis,
            String hvvScheduleUrl,
            String username,
            String password,
            WebPageScraper webPageScraper,
            Runnable stopUpdater,
            Consumer<CourtDisplayUpdater> updaterSetter,
            ReplaceRowsHandler replaceRows,
            RowSelectionsHandler rowSelections,
            GameRowsHandler gameRows,
            Consumer<String> mainStatusSetter,
            ErrorHandler errorHandler,
            BrowserOpener browserOpener,
            MessageProvider messageProvider,
            CountdownReset countdownReset) {
        stopUpdater.run();

        List<GameRow> initialRows = gameRows.fromRows(rows);
        if (initialRows.isEmpty()) {
            JOptionPane.showMessageDialog(parent, "Es wurden keine Spiele für die HTML-Anzeige gefunden.", "Keine Spiele", JOptionPane.WARNING_MESSAGE);
            return;
        }

        controls.setCourtDisplayBusy(true);
        controls.setStatus("HTML-Anzeige wird erzeugt...");
        SwingWorker<Path, Void> worker = new SwingWorker<>() {
            @Override
            protected Path doInBackground() throws Exception {
                return new CourtDisplayWriter().write(initialRows, courtDisplayFile, hvvScheduleUrl, Instant.now(), true);
            }

            @Override
            protected void done() {
                controls.setCourtDisplayBusy(false);
                try {
                    Path displayFile = get();
                    browserOpener.open(displayFile);
                    CourtDisplayUpdater updater = new CourtDisplayUpdater(
                            scrapedPage.sourceUrl(),
                            username,
                            password,
                            courtDisplayFile,
                            hvvScheduleUrl,
                            rows,
                            tableModel,
                            sorter,
                            controls,
                            webPageScraper,
                            replaceRows,
                            rowSelections,
                            gameRows,
                            mainStatusSetter,
                            messageProvider,
                            countdownReset,
                            refreshMillis);
                    updater.start();
                    updaterSetter.accept(updater);
                    controls.setCourtDisplayStarted();
                    controls.setStatus("HTML-Anzeige läuft: " + displayFile);
                } catch (Exception exception) {
                    String message = messageProvider.message(Task.WRITE_HTML, exception);
                    controls.setStatus("Fehler: " + message);
                    errorHandler.show(parent, "Fehler beim Erzeugen der HTML-Anzeige", message, exception);
                }
            }
        };
        worker.execute();
    }

    static void refreshGames(
            List<RowSelection> rows,
            DefaultTableModel tableModel,
            TableRowSorter<DefaultTableModel> sorter,
            SelectionControls controls,
            Component parent,
            String url,
            String username,
            String password,
            Path courtDisplayFile,
            String hvvScheduleUrl,
            boolean updateDisplay,
            WebPageScraper webPageScraper,
            ReplaceRowsHandler replaceRows,
            RowSelectionsHandler rowSelections,
            GameRowsHandler gameRows,
            Consumer<String> mainStatusSetter,
            ErrorHandler errorHandler,
            MessageProvider messageProvider) {
        if (url.isBlank()) {
            JOptionPane.showMessageDialog(parent, "Bitte URL angeben.", "Eingabe fehlt", JOptionPane.WARNING_MESSAGE);
            return;
        }

        controls.setBusy(true);
        controls.setStatus("Daten werden neu geladen...");
        SwingWorker<ManualRefreshResult, Void> worker = new SwingWorker<>() {
            @Override
            protected ManualRefreshResult doInBackground() throws Exception {
                WebPageScraper.ScrapeResult result = webPageScraper.scrapeWithStatus(url, username, password);
                Path displayFile = null;
                if (updateDisplay) {
                    displayFile = new CourtDisplayWriter().write(gameRows.fromPage(result.page()), courtDisplayFile, hvvScheduleUrl, Instant.now(), true);
                }
                return new ManualRefreshResult(result, displayFile);
            }

            @Override
            protected void done() {
                controls.setBusy(false);
                try {
                    ManualRefreshResult manualRefreshResult = get();
                    WebPageScraper.ScrapeResult result = manualRefreshResult.scrapeResult();
                    List<RowSelection> refreshedRows = rowSelections.map(result.page());
                    if (refreshedRows.isEmpty()) {
                        controls.setStatus("Keine Spiele gefunden");
                        JOptionPane.showMessageDialog(parent, "Es wurden keine Spiele gefunden.", "Keine Spiele", JOptionPane.WARNING_MESSAGE);
                        return;
                    }

                    replaceRows.replace(rows, tableModel, sorter, refreshedRows);
                    mainStatusSetter.accept("Spiele neu geladen");
                    String htmlStatus = manualRefreshResult.displayFile() == null ? "" : " HTML aktualisiert: " + manualRefreshResult.displayFile() + ".";
                    controls.setStatus("Daten neu geladen: " + rows.size() + " Spiele." + htmlStatus + " " + loginStatusText(result.loginStatus()));
                } catch (Exception exception) {
                    mainStatusSetter.accept("Fehler");
                    String message = messageProvider.message(Task.LOAD_GAMES, exception);
                    controls.setStatus("Fehler: " + message);
                    errorHandler.show(parent, "Fehler beim Neuladen der Spiele", message, exception);
                }
            }
        };
        worker.execute();
    }

    static String loginStatusText(WebPageScraper.LoginStatus loginStatus) {
        return switch (loginStatus) {
            case LOGIN_PERFORMED -> "Login wurde neu durchgeführt.";
            case SESSION_REUSED -> "Bestehende Session wurde verwendet.";
            case NOT_REQUIRED -> "Kein Login erforderlich.";
        };
    }

    @FunctionalInterface
    interface ReplaceRowsHandler {
        void replace(List<RowSelection> rows, DefaultTableModel tableModel, TableRowSorter<DefaultTableModel> sorter, List<RowSelection> refreshedRows);
    }

    @FunctionalInterface
    interface RowSelectionsHandler {
        List<RowSelection> map(ScrapedPage scrapedPage);
    }

    interface GameRowsHandler {
        List<GameRow> fromRows(List<RowSelection> rows);

        List<GameRow> fromPage(ScrapedPage scrapedPage);
    }

    @FunctionalInterface
    interface ErrorHandler {
        void show(Component parent, String title, String message, Exception exception);
    }

    @FunctionalInterface
    interface BrowserOpener {
        void open(Path file) throws IOException;
    }

    @FunctionalInterface
    interface MessageProvider {
        String message(Task task, Exception exception);
    }

    @FunctionalInterface
    interface CountdownReset {
        void reset();
    }

    static final class CourtDisplayUpdater {
        private final String sourceUrl;
        private final String username;
        private final String password;
        private final Path courtDisplayFile;
        private final String hvvScheduleUrl;
        private final List<RowSelection> rows;
        private final DefaultTableModel tableModel;
        private final TableRowSorter<DefaultTableModel> sorter;
        private final SelectionControls controls;
        private final WebPageScraper webPageScraper;
        private final ReplaceRowsHandler replaceRows;
        private final RowSelectionsHandler rowSelections;
        private final GameRowsHandler gameRows;
        private final Consumer<String> mainStatusSetter;
        private final MessageProvider messageProvider;
        private final CountdownReset countdownReset;
        private final Timer timer;
        private final int refreshMillis;
        private boolean updateRunning;
        private int secondsUntilRefresh;

        CourtDisplayUpdater(
                String sourceUrl,
                String username,
                String password,
                Path courtDisplayFile,
                String hvvScheduleUrl,
                List<RowSelection> rows,
                DefaultTableModel tableModel,
                TableRowSorter<DefaultTableModel> sorter,
                SelectionControls controls,
                WebPageScraper webPageScraper,
                ReplaceRowsHandler replaceRows,
                RowSelectionsHandler rowSelections,
                GameRowsHandler gameRows,
                Consumer<String> mainStatusSetter,
                MessageProvider messageProvider,
                CountdownReset countdownReset,
                int refreshMillis) {
            this.sourceUrl = sourceUrl;
            this.username = username;
            this.password = password;
            this.courtDisplayFile = courtDisplayFile;
            this.hvvScheduleUrl = hvvScheduleUrl;
            this.rows = rows;
            this.tableModel = tableModel;
            this.sorter = sorter;
            this.controls = controls;
            this.webPageScraper = webPageScraper;
            this.replaceRows = replaceRows;
            this.rowSelections = rowSelections;
            this.gameRows = gameRows;
            this.mainStatusSetter = mainStatusSetter;
            this.messageProvider = messageProvider;
            this.countdownReset = countdownReset;
            this.refreshMillis = refreshMillis;
            this.secondsUntilRefresh = refreshMillis / 1000;
            this.timer = new Timer(1_000, event -> tick());
            this.timer.setInitialDelay(0);
        }

        void start() {
            updateCountdownLabel();
            timer.start();
        }

        void stop() {
            timer.stop();
            controls.setRefreshCountdown("");
            countdownReset.reset();
        }

        private void tick() {
            if (!controls.isAutomaticRefreshEnabled()) {
                secondsUntilRefresh = refreshMillis / 1000;
                controls.setRefreshCountdown("Automatische Aktualisierung aus");
                return;
            }
            if (updateRunning) {
                controls.setRefreshCountdown("Aktualisierung läuft...");
                return;
            }
            if (secondsUntilRefresh <= 0) {
                update();
                return;
            }
            updateCountdownLabel();
            secondsUntilRefresh--;
        }

        private void updateCountdownLabel() {
            controls.setRefreshCountdown("Aktualisierung in " + secondsUntilRefresh + " Sekunden");
        }

        private void update() {
            if (updateRunning) {
                return;
            }
            updateRunning = true;
            controls.setRefreshCountdown("Aktualisierung läuft...");

            SwingWorker<CourtDisplayRefreshResult, Void> worker = new SwingWorker<>() {
                @Override
                protected CourtDisplayRefreshResult doInBackground() throws Exception {
                    WebPageScraper.ScrapeResult result = webPageScraper.scrapeWithStatus(sourceUrl, username, password);
                    ScrapedPage scrapedPage = result.page();
                    List<RowSelection> refreshedRows = rowSelections.map(scrapedPage);
                    Path displayFile = new CourtDisplayWriter().write(gameRows.fromPage(scrapedPage), courtDisplayFile, hvvScheduleUrl, Instant.now(), true);
                    return new CourtDisplayRefreshResult(displayFile, refreshedRows, result.loginStatus());
                }

                @Override
                protected void done() {
                    updateRunning = false;
                    secondsUntilRefresh = refreshMillis / 1000;
                    try {
                        CourtDisplayRefreshResult result = get();
                        replaceRows.replace(rows, tableModel, sorter, result.rows());
                        mainStatusSetter.accept("Spiele automatisch aktualisiert");
                        controls.setStatus("Automatisch aktualisiert: " + rows.size()
                                + " Spiele. HTML aktualisiert: " + result.displayFile()
                                + ". " + loginStatusText(result.loginStatus()));
                    } catch (Exception exception) {
                        controls.setStatus("HTML-Aktualisierung fehlgeschlagen: "
                                + messageProvider.message(Task.LOAD_GAMES, exception));
                    }
                    updateCountdownLabel();
                }
            };
            worker.execute();
        }
    }
}
