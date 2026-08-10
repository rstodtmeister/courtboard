package org.example;

import javax.swing.JButton;
import javax.swing.JCheckBox;
import javax.swing.JLabel;
import javax.swing.JProgressBar;
import java.awt.Desktop;
import java.io.IOException;
import java.nio.file.Path;

final class SelectionControls {
    private final JButton pdfDvvButton;
    private final JButton pdfEasyButton;
    private final JButton chooseOutputDirectoryButton;
    private final JCheckBox outputDirectoryCheckBox;
    private final JButton openOutputDirectoryButton;
    private final JButton courtDisplayButton;
    private final JButton refreshGamesButton;
    private final JButton saveQuickEditsButton;
    private final JCheckBox automaticRefreshCheckBox;
    private final JLabel statusLabel;
    private final JLabel refreshCountdownLabel;
    private final JProgressBar progressBar;
    private Path lastOutputFile;
    private boolean busy;

    SelectionControls(
            JButton pdfDvvButton,
            JButton pdfEasyButton,
            JButton chooseOutputDirectoryButton,
            JCheckBox outputDirectoryCheckBox,
            JButton openOutputDirectoryButton,
            JButton courtDisplayButton,
            JButton refreshGamesButton,
            JButton saveQuickEditsButton,
            JCheckBox automaticRefreshCheckBox,
            JLabel statusLabel,
            JLabel refreshCountdownLabel,
            JProgressBar progressBar) {
        this.pdfDvvButton = pdfDvvButton;
        this.pdfEasyButton = pdfEasyButton;
        this.chooseOutputDirectoryButton = chooseOutputDirectoryButton;
        this.outputDirectoryCheckBox = outputDirectoryCheckBox;
        this.openOutputDirectoryButton = openOutputDirectoryButton;
        this.courtDisplayButton = courtDisplayButton;
        this.refreshGamesButton = refreshGamesButton;
        this.saveQuickEditsButton = saveQuickEditsButton;
        this.automaticRefreshCheckBox = automaticRefreshCheckBox;
        this.statusLabel = statusLabel;
        this.refreshCountdownLabel = refreshCountdownLabel;
        this.progressBar = progressBar;

        openOutputDirectoryButton.addActionListener(event -> openLastOutputDirectory());
        updateRefreshMode();
    }

    boolean useOutputDirectory() {
        return outputDirectoryCheckBox.isSelected();
    }

    void setBusy(boolean busy) {
        this.busy = busy;
        pdfDvvButton.setEnabled(!busy);
        pdfEasyButton.setEnabled(!busy);
        outputDirectoryCheckBox.setEnabled(!busy);
        chooseOutputDirectoryButton.setEnabled(!busy && outputDirectoryCheckBox.isSelected());
        openOutputDirectoryButton.setEnabled(!busy && lastOutputFile != null);
        courtDisplayButton.setEnabled(!busy);
        saveQuickEditsButton.setEnabled(!busy);
        automaticRefreshCheckBox.setEnabled(!busy);
        updateRefreshButtonState();
        progressBar.setVisible(busy);
    }

    void setCourtDisplayBusy(boolean busy) {
        this.busy = busy;
        courtDisplayButton.setEnabled(!busy);
        saveQuickEditsButton.setEnabled(!busy);
        automaticRefreshCheckBox.setEnabled(!busy);
        updateRefreshButtonState();
        progressBar.setVisible(busy);
    }

    void setCourtDisplayStarted() {
        courtDisplayButton.setText("HTML Anzeige neu starten");
        courtDisplayButton.setEnabled(true);
    }

    void setStatus(String status) {
        statusLabel.setText(status);
    }

    void setRefreshCountdown(String status) {
        refreshCountdownLabel.setText(status == null ? "" : status);
    }

    boolean isAutomaticRefreshEnabled() {
        return automaticRefreshCheckBox.isSelected();
    }

    void updateRefreshMode() {
        if (isAutomaticRefreshEnabled()) {
            setRefreshCountdown("Automatische Aktualisierung aktiv");
        } else {
            setRefreshCountdown("Automatische Aktualisierung aus");
        }
        updateRefreshButtonState();
    }

    void setLastOutputFile(Path lastOutputFile) {
        this.lastOutputFile = lastOutputFile;
        openOutputDirectoryButton.setEnabled(lastOutputFile != null);
    }

    private void updateRefreshButtonState() {
        refreshGamesButton.setEnabled(!busy && !isAutomaticRefreshEnabled());
    }

    private void openLastOutputDirectory() {
        if (lastOutputFile == null || !Desktop.isDesktopSupported()) {
            return;
        }
        Path outputDirectory = lastOutputFile.toAbsolutePath().getParent();
        if (outputDirectory == null) {
            return;
        }
        try {
            Desktop.getDesktop().open(outputDirectory.toFile());
        } catch (IOException ignored) {
            // Opening the folder is only a convenience.
        }
    }
}
