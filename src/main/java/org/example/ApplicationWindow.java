package org.example;

import javax.swing.BorderFactory;
import javax.swing.JButton;
import javax.swing.JCheckBox;
import javax.swing.JComboBox;
import javax.swing.JDialog;
import javax.swing.JFileChooser;
import javax.swing.JFrame;
import javax.swing.JLabel;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JPasswordField;
import javax.swing.JProgressBar;
import javax.swing.RowFilter;
import javax.swing.JScrollPane;
import javax.swing.JTable;
import javax.swing.JTextArea;
import javax.swing.JTextField;
import javax.swing.SwingWorker;
import javax.swing.SwingUtilities;
import javax.swing.Timer;
import javax.swing.UIManager;
import javax.swing.border.EmptyBorder;
import javax.swing.event.RowSorterEvent;
import javax.swing.event.RowSorterListener;
import javax.swing.event.TableModelEvent;
import javax.swing.filechooser.FileNameExtensionFilter;
import javax.swing.table.DefaultTableCellRenderer;
import javax.swing.table.DefaultTableModel;
import javax.swing.table.TableCellRenderer;
import javax.swing.table.TableColumn;
import javax.swing.table.TableRowSorter;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Component;
import java.awt.Desktop;
import java.awt.Dimension;
import java.awt.Dialog;
import java.awt.FlowLayout;
import java.awt.Font;
import java.awt.GridBagConstraints;
import java.awt.GridBagLayout;
import java.awt.Insets;
import java.awt.Window;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;
import java.io.File;
import java.io.IOException;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.net.ConnectException;
import java.net.URI;
import java.net.NoRouteToHostException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.prefs.Preferences;

public class ApplicationWindow extends JFrame {
    private static final Color PRIMARY_COLOR = new Color(31, 78, 160);
    private static final Color MUTED_TEXT_COLOR = new Color(90, 90, 90);
    private static final Color TABLE_GRID_COLOR = new Color(220, 220, 220);
    private static final Color TABLE_STRIPE_COLOR = new Color(247, 249, 252);

    private static final String PREF_URL = "url";
    private static final String PREF_HVV_SCHEDULE_URL = "hvvScheduleUrl";
    private static final String PREF_USERNAME = "username";
    private static final String PREF_PASSWORD_ENCRYPTED = "passwordEncrypted";
    private static final String PREF_REMEMBER = "remember";
    private static final String PREF_LAST_OUTPUT_DIR = "lastOutputDir";
    private static final String PREF_USE_OUTPUT_DIR = "useOutputDir";
    private static final String PREF_PRINTED_GAME_KEYS = "printedGameKeys";
    private static final String LEGACY_PREF_PASSWORD = "password";
    private static final Path COURT_DISPLAY_FILE = Path.of("target", "court-display.html");
    private static final int COURT_DISPLAY_REFRESH_MILLIS = 30_000;
    private static final String PASSWORD_KEY_SALT = "org.example.CourtBoard.preferences.password.v1";
    private static final int GCM_IV_LENGTH = 12;
    private static final int GCM_TAG_LENGTH_BITS = 128;
    private static final int COLUMN_SELECTION = 0;
    private static final int COLUMN_NUMBER = 1;
    private static final int COLUMN_COURT = 2;
    private static final int COLUMN_TEAM_A = 3;
    private static final int COLUMN_TEAM_B = 4;
    private static final int COLUMN_REFEREE = 5;
    private static final int COLUMN_RESULT = 6;
    private static final int COLUMN_PRINTED = 7;
    private static final int COLUMN_STATUS = 8;
    private static final int COLUMN_GAME_RATING = 9;
    private static final int COLUMN_SET_1_TEAM_A = 10;
    private static final int COLUMN_SET_1_TEAM_B = 11;
    private static final int COLUMN_SET_2_TEAM_A = 12;
    private static final int COLUMN_SET_2_TEAM_B = 13;
    private static final int COLUMN_SET_3_TEAM_A = 14;
    private static final int COLUMN_SET_3_TEAM_B = 15;
    private static final int COLUMN_EDIT = 16;
    private static final int COLUMN_SAVE_STATUS = 17;
    private static final String DEFAULT_GAME_RATING = "Normal";
    private static final String[] GAME_RATING_OPTIONS = {
            "",
            "Normal",
            "Freilos B",
            "Freilos A",
            "Verletzung A",
            "Verletzung B",
            "Verletzung A + B",
            "Aufgabe A",
            "Aufgabe B",
            "Aufgabe A + B",
            "nicht angetreten A",
            "nicht angetreten B",
            "nicht angetreten A + B",
            "Verletzung A + Nichtangetreten B",
            "Nichtangetreten A + Verletzung B"
    };

    private final Preferences preferences = Preferences.userNodeForPackage(ApplicationWindow.class);
    private final JTextField urlField = new JTextField("https://example.org", 36);
    private final JTextField hvvScheduleUrlField = new JTextField(36);
    private final JButton openEditUrlButton = new JButton("Im Browser öffnen");
    private final JButton openHvvScheduleUrlButton = new JButton("Im Browser öffnen");
    private final JTextField usernameField = new JTextField(18);
    private final JPasswordField passwordField = new JPasswordField(18);
    private final JCheckBox rememberCheckBox = new JCheckBox("Eingaben merken");
    private final JButton generateButton = new JButton("Spiele laden");
    private final JLabel statusLabel = new JLabel("Bereit");
    private final JProgressBar progressBar = new JProgressBar();
    private final WebPageScraper webPageScraper = new WebPageScraper();
    private final Set<String> printedGameKeys = new HashSet<>();
    private CourtDisplayUpdater courtDisplayUpdater;
    private String lastLoadedUrl = "";
    private String lastLoadedHvvScheduleUrl = "";
    private String lastLoadedUsername = "";
    private String lastLoadedPassword = "";

    public ApplicationWindow() {
        super("Schiribögen PDF Generator");
        configureLookAndFeel();
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setLayout(new BorderLayout());
        loadPreferences();
        loadPrintedGameKeys();
        add(createForm(), BorderLayout.CENTER);
        add(createActions(), BorderLayout.SOUTH);
        getRootPane().setDefaultButton(generateButton);
        pack();
        setMinimumSize(getSize());
        SwingUtilities.updateComponentTreeUI(this);
        setLocationRelativeTo(null);
    }

    private void configureLookAndFeel() {
        try {
            UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
        } catch (Exception ignored) {
            // Keep Swing's default look and feel if the system one is unavailable.
        }
    }

    private JPanel createForm() {
        JPanel panel = new JPanel(new GridBagLayout());
        panel.setBorder(BorderFactory.createCompoundBorder(
                BorderFactory.createMatteBorder(0, 0, 1, 0, new Color(230, 230, 230)),
                new EmptyBorder(18, 18, 12, 18)));

        GridBagConstraints constraints = new GridBagConstraints();
        constraints.insets = new Insets(6, 6, 6, 6);
        constraints.anchor = GridBagConstraints.WEST;

        constraints.gridx = 0;
        constraints.gridy = 0;
        constraints.gridwidth = 2;
        JLabel heading = new JLabel("Spiele aus HVV-Beach laden");
        heading.setFont(heading.getFont().deriveFont(Font.BOLD, 17f));
        panel.add(heading, constraints);

        constraints.gridy = 1;
        JLabel hint = new JLabel("Nach dem Laden wählen Sie die Spiele und den gewünschten Bogen aus.");
        hint.setForeground(MUTED_TEXT_COLOR);
        panel.add(hint, constraints);

        constraints.gridwidth = 1;
        constraints.gridx = 0;
        constraints.gridy = 2;
        panel.add(new JLabel("Spielplan Edit URL:"), constraints);

        JPanel editUrlPanel = createUrlPanel(urlField, openEditUrlButton);
        JPanel hvvScheduleUrlPanel = createUrlPanel(hvvScheduleUrlField, openHvvScheduleUrlButton);

        constraints.gridx = 1;
        constraints.fill = GridBagConstraints.HORIZONTAL;
        constraints.weightx = 1;
        panel.add(editUrlPanel, constraints);

        constraints.gridx = 0;
        constraints.gridy = 3;
        constraints.fill = GridBagConstraints.NONE;
        constraints.weightx = 0;
        panel.add(new JLabel("HVV Spielplan URL:"), constraints);

        constraints.gridx = 1;
        constraints.fill = GridBagConstraints.HORIZONTAL;
        constraints.weightx = 1;
        panel.add(hvvScheduleUrlPanel, constraints);

        constraints.gridx = 0;
        constraints.gridy = 4;
        constraints.fill = GridBagConstraints.NONE;
        constraints.weightx = 0;
        panel.add(new JLabel("Benutzer:"), constraints);

        constraints.gridx = 1;
        constraints.fill = GridBagConstraints.HORIZONTAL;
        constraints.weightx = 1;
        panel.add(usernameField, constraints);

        constraints.gridx = 0;
        constraints.gridy = 5;
        constraints.fill = GridBagConstraints.NONE;
        constraints.weightx = 0;
        panel.add(new JLabel("Passwort:"), constraints);

        constraints.gridx = 1;
        constraints.fill = GridBagConstraints.HORIZONTAL;
        constraints.weightx = 1;
        panel.add(passwordField, constraints);

        constraints.gridx = 0;
        constraints.gridy = 6;
        constraints.fill = GridBagConstraints.NONE;
        constraints.weightx = 0;
        panel.add(new JLabel("Option:"), constraints);

        constraints.gridx = 1;
        panel.add(rememberCheckBox, constraints);

        urlField.setToolTipText("Adresse zum Bearbeiten des Spielplans");
        hvvScheduleUrlField.setToolTipText("Öffentliche HVV-Spielplan-Adresse");
        openEditUrlButton.setToolTipText("Spielplan Edit URL im Browser öffnen");
        openHvvScheduleUrlButton.setToolTipText("HVV Spielplan URL im Browser öffnen");
        openEditUrlButton.addActionListener(event -> openUrlFromField(urlField, "Spielplan Edit URL"));
        openHvvScheduleUrlButton.addActionListener(event -> openUrlFromField(hvvScheduleUrlField, "HVV Spielplan URL"));
        usernameField.setToolTipText("Benutzername für den HVV-Beach-Login");
        passwordField.setToolTipText("Passwort für den HVV-Beach-Login");
        generateButton.setFont(generateButton.getFont().deriveFont(Font.BOLD));

        return panel;
    }

    private JPanel createUrlPanel(JTextField field, JButton button) {
        JPanel panel = new JPanel(new BorderLayout(8, 0));
        panel.add(field, BorderLayout.CENTER);
        panel.add(button, BorderLayout.EAST);
        return panel;
    }

    private void openUrlFromField(JTextField field, String label) {
        String url = field.getText().trim();
        if (url.isBlank()) {
            JOptionPane.showMessageDialog(this, "Bitte " + label + " angeben.", "Eingabe fehlt", JOptionPane.WARNING_MESSAGE);
            return;
        }
        if (!isWebUrl(url)) {
            JOptionPane.showMessageDialog(this, label + " muss mit http:// oder https:// beginnen.", "Ungültige URL", JOptionPane.WARNING_MESSAGE);
            return;
        }
        try {
            openUrlInBrowser(url);
        } catch (Exception exception) {
            showErrorDialog(this, "URL konnte nicht geöffnet werden", userFriendlyMessage(Task.OPEN_URL, exception), exception);
        }
    }

    private JPanel createActions() {
        JPanel panel = new JPanel(new BorderLayout());
        panel.setBorder(new EmptyBorder(2, 16, 16, 16));

        JPanel buttons = new JPanel(new FlowLayout(FlowLayout.RIGHT, 0, 0));
        generateButton.addActionListener(event -> generatePdf());
        buttons.add(generateButton);

        progressBar.setIndeterminate(true);
        progressBar.setVisible(false);
        progressBar.setPreferredSize(new Dimension(140, 16));

        JPanel leftStatus = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
        leftStatus.add(statusLabel);
        leftStatus.add(progressBar);

        panel.add(leftStatus, BorderLayout.WEST);
        panel.add(buttons, BorderLayout.EAST);
        return panel;
    }

    private Path chooseOutputFile(Component parent, List<GameRow> selectedRows) {
        JFileChooser chooser = new JFileChooser();
        chooser.setDialogTitle("Zusammengeführte PDF speichern");
        chooser.setFileFilter(new FileNameExtensionFilter("PDF-Dateien", "pdf"));
        chooser.setApproveButtonText("PDF speichern");
        chooser.setSelectedFile(new File(preferences.get(PREF_LAST_OUTPUT_DIR, "target"), suggestedOutputFileName(selectedRows)));

        if (chooser.showSaveDialog(parent) == JFileChooser.APPROVE_OPTION) {
            File selectedFile = chooser.getSelectedFile();
            String path = selectedFile.getAbsolutePath();
            if (!path.toLowerCase().endsWith(".pdf")) {
                path += ".pdf";
            }
            Path outputFile = Path.of(path);
            Path outputParent = outputFile.toAbsolutePath().getParent();
            if (outputParent != null) {
                preferences.put(PREF_LAST_OUTPUT_DIR, outputParent.toString());
            }
            return outputFile;
        }
        return null;
    }

    private Path chooseOutputDirectory(Component parent) {
        JFileChooser chooser = new JFileChooser(preferences.get(PREF_LAST_OUTPUT_DIR, "target"));
        chooser.setDialogTitle("Ausgabeordner wählen");
        chooser.setFileSelectionMode(JFileChooser.DIRECTORIES_ONLY);
        chooser.setApproveButtonText("Ordner wählen");

        if (chooser.showOpenDialog(parent) == JFileChooser.APPROVE_OPTION) {
            Path outputDirectory = chooser.getSelectedFile().toPath();
            preferences.put(PREF_LAST_OUTPUT_DIR, outputDirectory.toAbsolutePath().toString());
            return outputDirectory;
        }
        return null;
    }

    private void generatePdf() {
        String url = urlField.getText().trim();
        String hvvScheduleUrl = hvvScheduleUrlField.getText().trim();
        String username = usernameField.getText().trim();
        char[] passwordChars = passwordField.getPassword();
        String password = new String(passwordChars);

        if (url.isBlank()) {
            java.util.Arrays.fill(passwordChars, '\0');
            JOptionPane.showMessageDialog(this, "Bitte URL angeben.", "Eingabe fehlt", JOptionPane.WARNING_MESSAGE);
            return;
        }

        if (isWebUrl(url) && (username.isBlank() || password.isBlank())) {
            java.util.Arrays.fill(passwordChars, '\0');
            JOptionPane.showMessageDialog(this, "Bitte Benutzer und Passwort für die Anmeldung angeben.", "Anmeldedaten fehlen", JOptionPane.WARNING_MESSAGE);
            return;
        }

        storePreferences(url, hvvScheduleUrl, username, password);
        lastLoadedUrl = url;
        lastLoadedHvvScheduleUrl = hvvScheduleUrl;
        lastLoadedUsername = username;
        lastLoadedPassword = password;

        setBusy(true);
        statusLabel.setText("Spiele werden geladen...");

        SwingWorker<ScrapedPage, Void> worker = new SwingWorker<>() {
            @Override
            protected ScrapedPage doInBackground() throws Exception {
                return webPageScraper.scrape(url, username, password);
            }

            @Override
            protected void done() {
                setBusy(false);
                try {
                    ScrapedPage scrapedPage = get();
                    setVisible(false);
                    showSelectionWindow(scrapedPage);
                } catch (Exception exception) {
                    statusLabel.setText("Fehler");
                    showErrorDialog(ApplicationWindow.this, "Fehler beim Laden der Spiele", userFriendlyMessage(Task.LOAD_GAMES, exception), exception);
                }
            }
        };
        worker.execute();
        java.util.Arrays.fill(passwordChars, '\0');
    }

    private void loadPreferences() {
        boolean remember = preferences.getBoolean(PREF_REMEMBER, false);
        rememberCheckBox.setSelected(remember);
        if (remember) {
            urlField.setText(preferences.get(PREF_URL, urlField.getText()));
            hvvScheduleUrlField.setText(preferences.get(PREF_HVV_SCHEDULE_URL, ""));
            usernameField.setText(preferences.get(PREF_USERNAME, ""));
            passwordField.setText(decryptPassword(preferences.get(PREF_PASSWORD_ENCRYPTED, "")));
        }
    }

    private void storePreferences(String url, String hvvScheduleUrl, String username, String password) {
        preferences.putBoolean(PREF_REMEMBER, rememberCheckBox.isSelected());
        if (rememberCheckBox.isSelected()) {
            preferences.put(PREF_URL, url);
            preferences.put(PREF_HVV_SCHEDULE_URL, hvvScheduleUrl);
            preferences.put(PREF_USERNAME, username);
            preferences.put(PREF_PASSWORD_ENCRYPTED, encryptPassword(password));
        } else {
            preferences.remove(PREF_URL);
            preferences.remove(PREF_HVV_SCHEDULE_URL);
            preferences.remove(PREF_USERNAME);
            preferences.remove(PREF_PASSWORD_ENCRYPTED);
        }
        preferences.remove(LEGACY_PREF_PASSWORD);
    }

    private void showSelectionWindow(ScrapedPage scrapedPage) {
        List<RowSelection> rows = new ArrayList<>();
        DefaultTableModel tableModel = new DefaultTableModel(new Object[]{
                "pdf Druck", "Nr", "Court", "Team A", "Team B", "Schiri", "Ergebnis", "Gedruckt", "Status",
                "Spielwertung", "S1 A", "S1 B", "S2 A", "S2 B", "S3 A", "S3 B", "Bearbeiten", "Speichern"
        }, 0) {
            @Override
            public Class<?> getColumnClass(int columnIndex) {
                return columnIndex == COLUMN_SELECTION ? Boolean.class : String.class;
            }

            @Override
            public boolean isCellEditable(int row, int column) {
                return column == COLUMN_SELECTION;
            }
        };

        for (PageSection section : scrapedPage.sections()) {
            for (String paragraph : section.paragraphs()) {
                GameRow gameRow = GameRow.fromParagraph(paragraph);
                rows.add(new RowSelection(section.heading(), gameRow));
                tableModel.addRow(tableRow(gameRow));
            }
        }

        if (rows.isEmpty()) {
            JOptionPane.showMessageDialog(this, "Es wurden keine Spiele gefunden.", "Keine Spiele", JOptionPane.WARNING_MESSAGE);
            return;
        }

        JTable table = new JTable(tableModel);
        TableRowSorter<DefaultTableModel> sorter = createRowSorter(tableModel);
        table.setRowSorter(sorter);
        applyDefaultGameSort(sorter);
        applyCompletedGamesFilter(sorter, false);
        table.setFillsViewportHeight(true);
        table.setRowHeight(28);
        table.setShowGrid(true);
        table.setGridColor(TABLE_GRID_COLOR);
        table.setIntercellSpacing(new Dimension(8, 1));
        table.setSelectionBackground(new Color(218, 232, 252));
        table.setSelectionForeground(Color.BLACK);
        table.setDefaultRenderer(String.class, new GameTableRenderer());
        table.getColumnModel().getColumn(COLUMN_EDIT).setCellRenderer(new ButtonCellRenderer("Bearbeiten"));
        table.getTableHeader().setReorderingAllowed(false);
        table.getTableHeader().setPreferredSize(new Dimension(table.getTableHeader().getPreferredSize().width, 30));
        table.getTableHeader().setBackground(PRIMARY_COLOR);
        table.getTableHeader().setForeground(Color.WHITE);
        table.getTableHeader().setFont(table.getTableHeader().getFont().deriveFont(Font.BOLD));
        table.getTableHeader().setOpaque(true);
        enableDragSelection(table, tableModel);
        table.getColumnModel().getColumn(COLUMN_SELECTION).setPreferredWidth(78);
        table.getColumnModel().getColumn(COLUMN_NUMBER).setMinWidth(38);
        table.getColumnModel().getColumn(COLUMN_NUMBER).setPreferredWidth(42);
        table.getColumnModel().getColumn(COLUMN_NUMBER).setMaxWidth(56);
        table.getColumnModel().getColumn(COLUMN_COURT).setMinWidth(42);
        table.getColumnModel().getColumn(COLUMN_COURT).setPreferredWidth(48);
        table.getColumnModel().getColumn(COLUMN_COURT).setMaxWidth(64);
        table.getColumnModel().getColumn(COLUMN_TEAM_A).setPreferredWidth(260);
        table.getColumnModel().getColumn(COLUMN_TEAM_B).setPreferredWidth(260);
        table.getColumnModel().getColumn(COLUMN_REFEREE).setPreferredWidth(180);
        table.getColumnModel().getColumn(COLUMN_RESULT).setPreferredWidth(110);
        table.getColumnModel().getColumn(COLUMN_PRINTED).setPreferredWidth(90);
        table.getColumnModel().getColumn(COLUMN_STATUS).setPreferredWidth(120);
        table.getColumnModel().getColumn(COLUMN_GAME_RATING).setPreferredWidth(120);
        table.getColumnModel().getColumn(COLUMN_SET_1_TEAM_A).setPreferredWidth(54);
        table.getColumnModel().getColumn(COLUMN_SET_1_TEAM_B).setPreferredWidth(54);
        table.getColumnModel().getColumn(COLUMN_SET_2_TEAM_A).setPreferredWidth(54);
        table.getColumnModel().getColumn(COLUMN_SET_2_TEAM_B).setPreferredWidth(54);
        table.getColumnModel().getColumn(COLUMN_SET_3_TEAM_A).setPreferredWidth(54);
        table.getColumnModel().getColumn(COLUMN_SET_3_TEAM_B).setPreferredWidth(54);
        table.getColumnModel().getColumn(COLUMN_EDIT).setPreferredWidth(110);
        table.getColumnModel().getColumn(COLUMN_SAVE_STATUS).setPreferredWidth(120);
        hideTableColumn(table, COLUMN_GAME_RATING);
        hideTableColumn(table, COLUMN_SET_1_TEAM_A);
        hideTableColumn(table, COLUMN_SET_1_TEAM_B);
        hideTableColumn(table, COLUMN_SET_2_TEAM_A);
        hideTableColumn(table, COLUMN_SET_2_TEAM_B);
        hideTableColumn(table, COLUMN_SET_3_TEAM_A);
        hideTableColumn(table, COLUMN_SET_3_TEAM_B);
        table.addMouseListener(new MouseAdapter() {
            @Override
            public void mouseClicked(MouseEvent event) {
                int viewRow = table.rowAtPoint(event.getPoint());
                int viewColumn = table.columnAtPoint(event.getPoint());
                if (viewRow < 0 || viewColumn < 0) {
                    return;
                }
                if (table.convertColumnIndexToModel(viewColumn) != COLUMN_EDIT) {
                    return;
                }
                int modelRow = table.convertRowIndexToModel(viewRow);
                loadAndShowGameEditDialog(rows, tableModel, modelRow, table);
            }
        });

        JScrollPane scrollPane = new JScrollPane(table);
        scrollPane.setPreferredSize(new Dimension(1080, 540));

        JPanel actionPanel = new JPanel(new BorderLayout());
        actionPanel.setBorder(BorderFactory.createTitledBorder("Auswahl"));
        JCheckBox showCompletedGamesCheckBox = new JCheckBox("Abgeschlossene Spiele anzeigen");
        JLabel countLabel = new JLabel();
        countLabel.setForeground(MUTED_TEXT_COLOR);
        updateSelectionCount(tableModel, table, countLabel);
        tableModel.addTableModelListener(event -> updateSelectionCount(tableModel, table, countLabel));
        tableModel.addTableModelListener(event -> markQuickEditChange(rows, tableModel, event));
        sorter.addRowSorterListener(new RowSorterListener() {
            @Override
            public void sorterChanged(RowSorterEvent event) {
                updateSelectionCount(tableModel, table, countLabel);
            }
        });
        showCompletedGamesCheckBox.addActionListener(event -> applyCompletedGamesFilter(sorter, showCompletedGamesCheckBox.isSelected()));
        actionPanel.add(showCompletedGamesCheckBox, BorderLayout.WEST);
        actionPanel.add(countLabel, BorderLayout.EAST);

        JPanel outputPanel = new JPanel(new BorderLayout(8, 0));
        outputPanel.setBorder(BorderFactory.createTitledBorder("Ausgabe"));
        JCheckBox outputDirectoryCheckBox = new JCheckBox("Ausgabeordner verwenden", preferences.getBoolean(PREF_USE_OUTPUT_DIR, false));
        JLabel outputDirectoryLabel = new JLabel(preferences.get(PREF_LAST_OUTPUT_DIR, "target"));
        outputDirectoryLabel.setForeground(MUTED_TEXT_COLOR);
        JButton chooseOutputDirectoryButton = new JButton("Ordner wählen");
        chooseOutputDirectoryButton.setEnabled(outputDirectoryCheckBox.isSelected());
        outputDirectoryCheckBox.addActionListener(event -> {
            boolean useOutputDirectory = outputDirectoryCheckBox.isSelected();
            preferences.putBoolean(PREF_USE_OUTPUT_DIR, useOutputDirectory);
            chooseOutputDirectoryButton.setEnabled(useOutputDirectory);
        });
        chooseOutputDirectoryButton.addActionListener(event -> {
            Path outputDirectory = chooseOutputDirectory(ApplicationWindow.this);
            if (outputDirectory != null) {
                outputDirectoryLabel.setText(outputDirectory.toAbsolutePath().toString());
            }
        });

        JPanel outputDirectoryActions = new JPanel(new FlowLayout(FlowLayout.LEFT, 6, 0));
        outputDirectoryActions.add(outputDirectoryCheckBox);
        outputDirectoryActions.add(chooseOutputDirectoryButton);
        outputPanel.add(outputDirectoryActions, BorderLayout.WEST);
        outputPanel.add(outputDirectoryLabel, BorderLayout.CENTER);

        JPanel topPanel = new JPanel(new BorderLayout(0, 8));
        JLabel dialogHint = new JLabel("Checkbox anklicken oder mit gedrückter linker Maustaste über Zeilen ziehen.");
        dialogHint.setBorder(new EmptyBorder(0, 0, 4, 0));
        dialogHint.setForeground(MUTED_TEXT_COLOR);
        topPanel.add(dialogHint, BorderLayout.NORTH);
        topPanel.add(outputPanel, BorderLayout.SOUTH);

        JPanel contentPanel = new JPanel(new BorderLayout(0, 8));
        contentPanel.add(topPanel, BorderLayout.NORTH);
        contentPanel.add(scrollPane, BorderLayout.CENTER);
        contentPanel.add(actionPanel, BorderLayout.SOUTH);

        JDialog dialog = new JDialog(this, "Spiele auswählen", true);
        dialog.setDefaultCloseOperation(JDialog.DISPOSE_ON_CLOSE);
        dialog.addWindowListener(new WindowAdapter() {
            @Override
            public void windowClosed(WindowEvent event) {
                stopCourtDisplayUpdater();
                ApplicationWindow.this.dispose();
                System.exit(0);
            }
        });

        JButton pdfDvvButton = new JButton("pdf DVV");
        JButton pdfEasyButton = new JButton("pdf Easy");
        JButton courtDisplayButton = new JButton("HTML Anzeige starten");
        JButton refreshGamesButton = new JButton("Daten neu laden");
        JButton saveQuickEditsButton = new JButton("Speichern");
        JCheckBox automaticRefreshCheckBox = new JCheckBox("Automatisch aktualisieren", false);
        JButton openEditUrlInSelectionButton = new JButton("Edit öffnen");
        JButton openHvvScheduleUrlInSelectionButton = new JButton("HVV öffnen");
        JButton openOutputDirectoryButton = new JButton("Ordner öffnen");
        JLabel dialogStatusLabel = new JLabel("Bereit");
        JLabel refreshCountdownLabel = new JLabel("");
        JProgressBar dialogProgressBar = new JProgressBar();
        dialogStatusLabel.setForeground(MUTED_TEXT_COLOR);
        refreshCountdownLabel.setForeground(MUTED_TEXT_COLOR);
        dialogProgressBar.setIndeterminate(true);
        dialogProgressBar.setVisible(false);
        dialogProgressBar.setPreferredSize(new Dimension(150, 16));
        openOutputDirectoryButton.setEnabled(false);

        SelectionControls controls = new SelectionControls(
                pdfDvvButton,
                pdfEasyButton,
                chooseOutputDirectoryButton,
                outputDirectoryCheckBox,
                openOutputDirectoryButton,
                courtDisplayButton,
                refreshGamesButton,
                saveQuickEditsButton,
                automaticRefreshCheckBox,
                dialogStatusLabel,
                refreshCountdownLabel,
                dialogProgressBar);

        pdfDvvButton.addActionListener(event -> createSelectedPdf(rows, tableModel, dialog, SheetType.NORMAL, controls));
        pdfEasyButton.addActionListener(event -> createSelectedPdf(rows, tableModel, dialog, SheetType.EASY, controls));
        courtDisplayButton.addActionListener(event -> startCourtDisplay(scrapedPage, rows, tableModel, sorter, controls, dialog));
        refreshGamesButton.addActionListener(event -> refreshGames(rows, tableModel, sorter, controls, dialog));
        saveQuickEditsButton.addActionListener(event -> saveQuickEdits(rows, tableModel, sorter, controls, dialog));
        automaticRefreshCheckBox.addActionListener(event -> {
            controls.updateRefreshMode();
        });
        openEditUrlInSelectionButton.addActionListener(event -> openUrlFromField(urlField, "Spielplan Edit URL"));
        openHvvScheduleUrlInSelectionButton.addActionListener(event -> openUrlFromField(hvvScheduleUrlField, "HVV Spielplan URL"));

        JPanel refreshControls = new JPanel(new FlowLayout(FlowLayout.LEFT, 6, 0));
        refreshControls.setBorder(BorderFactory.createTitledBorder("Aktualisierung"));
        refreshControls.add(automaticRefreshCheckBox);
        refreshControls.add(refreshGamesButton);
        refreshControls.add(refreshCountdownLabel);

        JPanel webButtons = new JPanel(new FlowLayout(FlowLayout.LEFT, 6, 0));
        webButtons.setBorder(BorderFactory.createTitledBorder("Web"));
        webButtons.add(openEditUrlInSelectionButton);
        webButtons.add(openHvvScheduleUrlInSelectionButton);
        JPanel quickEditButtons = new JPanel(new FlowLayout(FlowLayout.LEFT, 6, 0));
        quickEditButtons.setBorder(BorderFactory.createTitledBorder("Schnellbearbeitung"));
        quickEditButtons.add(saveQuickEditsButton);

        JPanel displayButtons = new JPanel(new FlowLayout(FlowLayout.LEFT, 6, 0));
        displayButtons.setBorder(BorderFactory.createTitledBorder("Anzeige"));
        displayButtons.add(courtDisplayButton);
        displayButtons.add(openOutputDirectoryButton);

        JPanel pdfButtons = new JPanel(new FlowLayout(FlowLayout.LEFT, 6, 0));
        pdfButtons.setBorder(BorderFactory.createTitledBorder("PDF"));
        pdfButtons.add(pdfDvvButton);
        pdfButtons.add(pdfEasyButton);

        JPanel groupedButtons = new JPanel(new FlowLayout(FlowLayout.RIGHT, 8, 0));
        groupedButtons.add(refreshControls);
        groupedButtons.add(webButtons);
        groupedButtons.add(quickEditButtons);
        groupedButtons.add(displayButtons);
        groupedButtons.add(pdfButtons);

        JPanel statusPanel = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
        statusPanel.add(dialogStatusLabel);
        statusPanel.add(dialogProgressBar);

        JPanel buttonRow = new JPanel(new BorderLayout());
        buttonRow.add(groupedButtons, BorderLayout.EAST);

        JPanel footerPanel = new JPanel(new BorderLayout(0, 6));
        footerPanel.add(buttonRow, BorderLayout.NORTH);
        footerPanel.add(statusPanel, BorderLayout.SOUTH);

        JPanel dialogPanel = new JPanel(new BorderLayout(0, 10));
        dialogPanel.setBorder(new EmptyBorder(12, 12, 12, 12));
        dialogPanel.add(contentPanel, BorderLayout.CENTER);
        dialogPanel.add(footerPanel, BorderLayout.SOUTH);

        dialog.setContentPane(dialogPanel);
        dialog.getRootPane().setDefaultButton(pdfDvvButton);
        dialog.pack();
        dialog.setMinimumSize(dialog.getSize());
        dialog.setLocationRelativeTo(this);
        statusLabel.setText("Spiele geladen");
        dialog.setVisible(true);
    }

    private void startCourtDisplay(ScrapedPage scrapedPage, List<RowSelection> rows, DefaultTableModel tableModel, TableRowSorter<DefaultTableModel> sorter, SelectionControls controls, Component parent) {
        stopCourtDisplayUpdater();

        List<GameRow> initialRows = gameRows(rows);
        if (initialRows.isEmpty()) {
            JOptionPane.showMessageDialog(parent, "Es wurden keine Spiele für die HTML-Anzeige gefunden.", "Keine Spiele", JOptionPane.WARNING_MESSAGE);
            return;
        }

        controls.setCourtDisplayBusy(true);
        controls.setStatus("HTML-Anzeige wird erzeugt...");
        SwingWorker<Path, Void> worker = new SwingWorker<>() {
            @Override
            protected Path doInBackground() throws Exception {
                return new CourtDisplayWriter().write(initialRows, COURT_DISPLAY_FILE, lastLoadedHvvScheduleUrl, java.time.Instant.now(), true);
            }

            @Override
            protected void done() {
                controls.setCourtDisplayBusy(false);
                try {
                    Path displayFile = get();
                    openInBrowser(displayFile);
                    courtDisplayUpdater = new CourtDisplayUpdater(
                            scrapedPage.sourceUrl(),
                            lastLoadedUsername,
                            lastLoadedPassword,
                            rows,
                            tableModel,
                            sorter,
                            controls);
                    courtDisplayUpdater.start();
                    controls.setCourtDisplayStarted();
                    controls.setStatus("HTML-Anzeige läuft: " + displayFile);
                } catch (Exception exception) {
                    String message = userFriendlyMessage(Task.WRITE_HTML, exception);
                    controls.setStatus("Fehler: " + message);
                    showErrorDialog(parent, "Fehler beim Erzeugen der HTML-Anzeige", message, exception);
                }
            }
        };
        worker.execute();
    }

    private void refreshGames(List<RowSelection> rows, DefaultTableModel tableModel, TableRowSorter<DefaultTableModel> sorter, SelectionControls controls, Component parent) {
        String url = lastLoadedUrl.isBlank() ? urlField.getText().trim() : lastLoadedUrl;
        String username = lastLoadedUsername;
        String password = lastLoadedPassword;

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
                if (courtDisplayUpdater != null) {
                    displayFile = new CourtDisplayWriter().write(gameRows(result.page()), COURT_DISPLAY_FILE, lastLoadedHvvScheduleUrl, java.time.Instant.now(), true);
                }
                return new ManualRefreshResult(result, displayFile);
            }

            @Override
            protected void done() {
                controls.setBusy(false);
                try {
                    ManualRefreshResult manualRefreshResult = get();
                    WebPageScraper.ScrapeResult result = manualRefreshResult.scrapeResult();
                    ScrapedPage refreshedPage = result.page();
                    List<RowSelection> refreshedRows = rowSelections(refreshedPage);
                    if (refreshedRows.isEmpty()) {
                        controls.setStatus("Keine Spiele gefunden");
                        JOptionPane.showMessageDialog(parent, "Es wurden keine Spiele gefunden.", "Keine Spiele", JOptionPane.WARNING_MESSAGE);
                        return;
                    }

                    replaceRows(rows, tableModel, sorter, refreshedRows);
                    statusLabel.setText("Spiele neu geladen");
                    String htmlStatus = manualRefreshResult.displayFile() == null ? "" : " HTML aktualisiert: " + manualRefreshResult.displayFile() + ".";
                    controls.setStatus("Daten neu geladen: " + rows.size() + " Spiele." + htmlStatus + " " + loginStatusText(result.loginStatus()));
                } catch (Exception exception) {
                    statusLabel.setText("Fehler");
                    String message = userFriendlyMessage(Task.LOAD_GAMES, exception);
                    controls.setStatus("Fehler: " + message);
                    showErrorDialog(parent, "Fehler beim Neuladen der Spiele", message, exception);
                }
            }
        };
        worker.execute();
    }

    private void replaceRows(List<RowSelection> rows, DefaultTableModel tableModel, TableRowSorter<DefaultTableModel> sorter, List<RowSelection> refreshedRows) {
        sorter.setSortKeys(List.of());
        tableModel.setRowCount(0);
        for (RowSelection row : refreshedRows) {
            GameRow gameRow = row.gameRow();
            tableModel.addRow(tableRow(gameRow));
        }
        rows.clear();
        rows.addAll(refreshedRows);
        applyDefaultGameSort(sorter);
    }

    private List<RowSelection> rowSelections(ScrapedPage scrapedPage) {
        List<RowSelection> rows = new ArrayList<>();
        for (PageSection section : scrapedPage.sections()) {
            for (String paragraph : section.paragraphs()) {
                rows.add(new RowSelection(section.heading(), GameRow.fromParagraph(paragraph)));
            }
        }
        return rows;
    }

    private String loginStatusText(WebPageScraper.LoginStatus loginStatus) {
        return switch (loginStatus) {
            case LOGIN_PERFORMED -> "Login wurde neu durchgeführt.";
            case SESSION_REUSED -> "Bestehende Session wurde verwendet.";
            case NOT_REQUIRED -> "Kein Login erforderlich.";
        };
    }

    private Object[] tableRow(GameRow gameRow) {
        return new Object[]{
                Boolean.FALSE,
                gameRow.number(),
                gameRow.court(),
                gameRow.teamA(),
                gameRow.teamB(),
                gameRow.referee(),
                gameRow.result(),
                printedGameKeys.contains(gameKey(gameRow)) ? "Ja" : "",
                gameRow.isCompleted() ? "Abgeschlossen" : "",
                gameRow.gameRating(),
                gameRow.set1TeamA(),
                gameRow.set1TeamB(),
                gameRow.set2TeamA(),
                gameRow.set2TeamB(),
                gameRow.set3TeamA(),
                gameRow.set3TeamB(),
                "Bearbeiten",
                gameRow.editUrl().isBlank() ? "Kein Edit-Link" : ""
        };
    }

    private boolean isQuickEditColumn(int column) {
        return column == COLUMN_COURT
                || column == COLUMN_GAME_RATING
                || column == COLUMN_SET_1_TEAM_A
                || column == COLUMN_SET_1_TEAM_B
                || column == COLUMN_SET_2_TEAM_A
                || column == COLUMN_SET_2_TEAM_B
                || column == COLUMN_SET_3_TEAM_A
                || column == COLUMN_SET_3_TEAM_B;
    }

    private void hideTableColumn(JTable table, int modelColumn) {
        int viewColumn = table.convertColumnIndexToView(modelColumn);
        if (viewColumn < 0) {
            return;
        }
        TableColumn column = table.getColumnModel().getColumn(viewColumn);
        column.setMinWidth(0);
        column.setPreferredWidth(0);
        column.setMaxWidth(0);
        column.setResizable(false);
    }

    private void loadAndShowGameEditDialog(List<RowSelection> rows, DefaultTableModel tableModel, int modelRow, Component parent) {
        if (modelRow < 0 || modelRow >= rows.size()) {
            return;
        }

        tableModel.setValueAt("Lade...", modelRow, COLUMN_SAVE_STATUS);
        SwingWorker<GameEditUpdate, Void> worker = new SwingWorker<>() {
            @Override
            protected GameEditUpdate doInBackground() throws Exception {
                RowSelection row = rows.get(modelRow);
                GameEditUpdate request = gameEditUpdate(row.gameRow(), tableModel, modelRow);
                return webPageScraper.loadGameEditValues(request, lastLoadedUsername, lastLoadedPassword);
            }

            @Override
            protected void done() {
                try {
                    GameEditUpdate editValues = get();
                    if (!rows.get(modelRow).isDirty()) {
                        tableModel.setValueAt("", modelRow, COLUMN_SAVE_STATUS);
                    }
                    showGameEditDialog(rows, tableModel, modelRow, parent, editValues);
                } catch (Exception exception) {
                    tableModel.setValueAt("Fehler", modelRow, COLUMN_SAVE_STATUS);
                    showErrorDialog(parent, "Fehler beim Laden der Bearbeiten-Seite", userFriendlyMessage(Task.SAVE_GAME, exception), exception);
                }
            }
        };
        worker.execute();
    }

    private void showGameEditDialog(List<RowSelection> rows, DefaultTableModel tableModel, int modelRow, Component parent, GameEditUpdate editValues) {
        if (modelRow < 0 || modelRow >= rows.size()) {
            return;
        }

        GameRow gameRow = rows.get(modelRow).gameRow();
        JTextField courtField = new JTextField(firstNonBlank(editValues.court(), gameRow.court(), tableValue(tableModel, modelRow, COLUMN_COURT)), 8);
        JComboBox<String> ratingComboBox = new JComboBox<>(GAME_RATING_OPTIONS);
        ratingComboBox.setSelectedItem(firstNonBlank(editValues.gameRating(), gameRow.gameRating(), tableValue(tableModel, modelRow, COLUMN_GAME_RATING)));
        String[] resultScores = setScoresFromResult(gameRow.result());
        JTextField set1TeamAField = new JTextField(firstNonBlank(editValues.set1TeamA(), gameRow.set1TeamA(), tableValue(tableModel, modelRow, COLUMN_SET_1_TEAM_A), resultScores[0]), 5);
        JTextField set1TeamBField = new JTextField(firstNonBlank(editValues.set1TeamB(), gameRow.set1TeamB(), tableValue(tableModel, modelRow, COLUMN_SET_1_TEAM_B), resultScores[1]), 5);
        JTextField set2TeamAField = new JTextField(firstNonBlank(editValues.set2TeamA(), gameRow.set2TeamA(), tableValue(tableModel, modelRow, COLUMN_SET_2_TEAM_A), resultScores[2]), 5);
        JTextField set2TeamBField = new JTextField(firstNonBlank(editValues.set2TeamB(), gameRow.set2TeamB(), tableValue(tableModel, modelRow, COLUMN_SET_2_TEAM_B), resultScores[3]), 5);
        JTextField set3TeamAField = new JTextField(firstNonBlank(editValues.set3TeamA(), gameRow.set3TeamA(), tableValue(tableModel, modelRow, COLUMN_SET_3_TEAM_A), resultScores[4]), 5);
        JTextField set3TeamBField = new JTextField(firstNonBlank(editValues.set3TeamB(), gameRow.set3TeamB(), tableValue(tableModel, modelRow, COLUMN_SET_3_TEAM_B), resultScores[5]), 5);

        JPanel panel = new JPanel(new GridBagLayout());
        panel.setBorder(new EmptyBorder(8, 8, 8, 8));
        GridBagConstraints constraints = new GridBagConstraints();
        constraints.insets = new Insets(5, 5, 5, 5);
        constraints.anchor = GridBagConstraints.WEST;

        addEditField(panel, constraints, 0, "Spiel", createGameTeamsPanel(gameRow));
        addEditField(panel, constraints, 1, "Court", courtField);
        addEditField(panel, constraints, 2, "Spielwertung", ratingComboBox);

        constraints.gridx = 0;
        constraints.gridy = 3;
        panel.add(new JLabel("Satzpunkte"), constraints);
        JPanel scorePanel = new JPanel(new GridBagLayout());
        GridBagConstraints scoreConstraints = new GridBagConstraints();
        scoreConstraints.insets = new Insets(3, 4, 3, 4);
        scoreConstraints.anchor = GridBagConstraints.WEST;
        addScoreHeader(scorePanel, scoreConstraints);
        addScoreField(scorePanel, scoreConstraints, 1, "1. Satz", set1TeamAField, set1TeamBField);
        addScoreField(scorePanel, scoreConstraints, 2, "2. Satz", set2TeamAField, set2TeamBField);
        addScoreField(scorePanel, scoreConstraints, 3, "3. Satz", set3TeamAField, set3TeamBField);
        constraints.gridx = 1;
        constraints.fill = GridBagConstraints.HORIZONTAL;
        panel.add(scorePanel, constraints);

        int result = JOptionPane.showConfirmDialog(parent, panel, "Spiel bearbeiten", JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE);
        if (result != JOptionPane.OK_OPTION) {
            return;
        }

        String rating = selectedValue(ratingComboBox);
        if (rating.isBlank() && hasAnySetScore(
                set1TeamAField.getText(), set1TeamBField.getText(),
                set2TeamAField.getText(), set2TeamBField.getText(),
                set3TeamAField.getText(), set3TeamBField.getText())) {
            rating = DEFAULT_GAME_RATING;
        }

        tableModel.setValueAt(courtField.getText().trim(), modelRow, COLUMN_COURT);
        tableModel.setValueAt(rating, modelRow, COLUMN_GAME_RATING);
        tableModel.setValueAt(set1TeamAField.getText().trim(), modelRow, COLUMN_SET_1_TEAM_A);
        tableModel.setValueAt(set1TeamBField.getText().trim(), modelRow, COLUMN_SET_1_TEAM_B);
        tableModel.setValueAt(set2TeamAField.getText().trim(), modelRow, COLUMN_SET_2_TEAM_A);
        tableModel.setValueAt(set2TeamBField.getText().trim(), modelRow, COLUMN_SET_2_TEAM_B);
        tableModel.setValueAt(set3TeamAField.getText().trim(), modelRow, COLUMN_SET_3_TEAM_A);
        tableModel.setValueAt(set3TeamBField.getText().trim(), modelRow, COLUMN_SET_3_TEAM_B);

        RowSelection previous = rows.get(modelRow);
        RowSelection updated = new RowSelection(previous.sectionHeading(), updatedGameRow(previous.gameRow(), tableModel, modelRow));
        updated.setDirty(true);
        rows.set(modelRow, updated);
        tableModel.setValueAt("Geändert", modelRow, COLUMN_SAVE_STATUS);
    }

    private void addEditField(JPanel panel, GridBagConstraints constraints, int row, String label, Component field) {
        constraints.gridx = 0;
        constraints.gridy = row;
        constraints.fill = GridBagConstraints.NONE;
        constraints.weightx = 0;
        panel.add(new JLabel(label + ":"), constraints);
        constraints.gridx = 1;
        constraints.fill = GridBagConstraints.HORIZONTAL;
        constraints.weightx = 1;
        panel.add(field, constraints);
    }

    private JPanel createGameTeamsPanel(GameRow gameRow) {
        JPanel panel = new JPanel(new GridBagLayout());
        GridBagConstraints constraints = new GridBagConstraints();
        constraints.insets = new Insets(0, 0, 2, 0);
        constraints.anchor = GridBagConstraints.WEST;
        constraints.gridx = 0;
        constraints.gridy = 0;
        constraints.gridwidth = 2;
        panel.add(new JLabel("Nr.: " + gameRow.number()), constraints);

        constraints.gridy = 1;
        constraints.gridwidth = 1;
        constraints.insets = new Insets(0, 0, 2, 0);
        panel.add(new JLabel("Team A: " + gameRow.teamA()), constraints);

        constraints.gridy = 2;
        panel.add(new JLabel("Team B: " + gameRow.teamB()), constraints);
        return panel;
    }

    private void addScoreHeader(JPanel panel, GridBagConstraints constraints) {
        JLabel teamALabel = new JLabel("Team A");
        JLabel teamBLabel = new JLabel("Team B");
        teamALabel.setFont(teamALabel.getFont().deriveFont(Font.BOLD));
        teamBLabel.setFont(teamBLabel.getFont().deriveFont(Font.BOLD));

        constraints.gridy = 0;
        constraints.gridx = 1;
        panel.add(teamALabel, constraints);
        constraints.gridx = 2;
        panel.add(teamBLabel, constraints);
    }

    private void addScoreField(JPanel panel, GridBagConstraints constraints, int row, String label, JTextField teamAField, JTextField teamBField) {
        constraints.gridy = row;
        constraints.gridx = 0;
        panel.add(new JLabel(label), constraints);
        constraints.gridx = 1;
        panel.add(teamAField, constraints);
        constraints.gridx = 2;
        panel.add(teamBField, constraints);
    }

    private String selectedValue(JComboBox<String> comboBox) {
        Object selectedItem = comboBox.getSelectedItem();
        return selectedItem == null ? "" : selectedItem.toString().trim();
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.trim().isBlank()) {
                return value.trim();
            }
        }
        return "";
    }

    private String[] setScoresFromResult(String result) {
        String[] scores = {"", "", "", "", "", ""};
        if (result == null || result.isBlank()) {
            return scores;
        }
        java.util.regex.Matcher matcher = java.util.regex.Pattern
                .compile("(\\d{1,2})\\s*[:\\-]\\s*(\\d{1,2})")
                .matcher(result);
        int index = 0;
        while (matcher.find() && index < scores.length) {
            scores[index++] = matcher.group(1);
            scores[index++] = matcher.group(2);
        }
        return scores;
    }

    private boolean hasAnySetScore(String... values) {
        for (String value : values) {
            if (value != null && !value.trim().isBlank()) {
                return true;
            }
        }
        return false;
    }

    private void markQuickEditChange(List<RowSelection> rows, DefaultTableModel tableModel, TableModelEvent event) {
        if (event.getType() != TableModelEvent.UPDATE || event.getFirstRow() < 0) {
            return;
        }
        int column = event.getColumn();
        if (!isQuickEditColumn(column)) {
            return;
        }
        for (int row = event.getFirstRow(); row <= event.getLastRow() && row < rows.size(); row++) {
            if (isSetScoreColumn(column)
                    && tableValue(tableModel, row, COLUMN_GAME_RATING).isBlank()
                    && hasAnySetScore(tableModel, row)) {
                tableModel.setValueAt(DEFAULT_GAME_RATING, row, COLUMN_GAME_RATING);
            }
            rows.get(row).setDirty(true);
            tableModel.setValueAt("Geändert", row, COLUMN_SAVE_STATUS);
        }
    }

    private boolean isSetScoreColumn(int column) {
        return column == COLUMN_SET_1_TEAM_A
                || column == COLUMN_SET_1_TEAM_B
                || column == COLUMN_SET_2_TEAM_A
                || column == COLUMN_SET_2_TEAM_B
                || column == COLUMN_SET_3_TEAM_A
                || column == COLUMN_SET_3_TEAM_B;
    }

    private boolean hasAnySetScore(DefaultTableModel tableModel, int row) {
        return !tableValue(tableModel, row, COLUMN_SET_1_TEAM_A).isBlank()
                || !tableValue(tableModel, row, COLUMN_SET_1_TEAM_B).isBlank()
                || !tableValue(tableModel, row, COLUMN_SET_2_TEAM_A).isBlank()
                || !tableValue(tableModel, row, COLUMN_SET_2_TEAM_B).isBlank()
                || !tableValue(tableModel, row, COLUMN_SET_3_TEAM_A).isBlank()
                || !tableValue(tableModel, row, COLUMN_SET_3_TEAM_B).isBlank();
    }

    private void saveQuickEdits(List<RowSelection> rows, DefaultTableModel tableModel, TableRowSorter<DefaultTableModel> sorter, SelectionControls controls, Component parent) {
        List<Integer> dirtyRows = new ArrayList<>();
        for (int rowIndex = 0; rowIndex < rows.size(); rowIndex++) {
            if (rows.get(rowIndex).isDirty()) {
                dirtyRows.add(rowIndex);
            }
        }
        if (dirtyRows.isEmpty()) {
            JOptionPane.showMessageDialog(parent, "Es gibt keine geänderten Schnellfelder.", "Keine Änderungen", JOptionPane.INFORMATION_MESSAGE);
            return;
        }

        controls.setBusy(true);
        controls.setStatus("Änderungen werden gespeichert...");
        SwingWorker<Integer, Void> worker = new SwingWorker<>() {
            @Override
            protected Integer doInBackground() throws Exception {
                int saved = 0;
                for (Integer rowIndex : dirtyRows) {
                    RowSelection row = rows.get(rowIndex);
                    GameEditUpdate update = gameEditUpdate(row.gameRow(), tableModel, rowIndex);
                    webPageScraper.submitGameUpdate(update, lastLoadedUsername, lastLoadedPassword);
                    saved++;
                }
                return saved;
            }

            @Override
            protected void done() {
                controls.setBusy(false);
                try {
                    int saved = get();
                    for (Integer rowIndex : dirtyRows) {
                        RowSelection row = rows.get(rowIndex);
                        GameRow updatedGameRow = updatedGameRow(row.gameRow(), tableModel, rowIndex);
                        rows.set(rowIndex, new RowSelection(row.sectionHeading(), updatedGameRow));
                        tableModel.setValueAt("", rowIndex, COLUMN_SAVE_STATUS);
                    }
                    controls.setStatus(saved + " Änderung(en) gespeichert. Daten werden neu geladen...");
                    refreshGames(rows, tableModel, sorter, controls, parent);
                } catch (Exception exception) {
                    controls.setStatus("Fehler: " + userFriendlyMessage(Task.SAVE_GAME, exception));
                    showErrorDialog(parent, "Fehler beim Speichern der Änderungen", userFriendlyMessage(Task.SAVE_GAME, exception), exception);
                }
            }
        };
        worker.execute();
    }

    private GameEditUpdate gameEditUpdate(GameRow original, DefaultTableModel tableModel, int rowIndex) {
        return new GameEditUpdate(
                original.editUrl(),
                original.editMethod(),
                original.editData(),
                tableValue(tableModel, rowIndex, COLUMN_COURT),
                tableValue(tableModel, rowIndex, COLUMN_GAME_RATING),
                tableValue(tableModel, rowIndex, COLUMN_SET_1_TEAM_A),
                tableValue(tableModel, rowIndex, COLUMN_SET_1_TEAM_B),
                tableValue(tableModel, rowIndex, COLUMN_SET_2_TEAM_A),
                tableValue(tableModel, rowIndex, COLUMN_SET_2_TEAM_B),
                tableValue(tableModel, rowIndex, COLUMN_SET_3_TEAM_A),
                tableValue(tableModel, rowIndex, COLUMN_SET_3_TEAM_B));
    }

    private GameRow updatedGameRow(GameRow original, DefaultTableModel tableModel, int rowIndex) {
        return new GameRow(
                original.number(),
                original.round(),
                original.date(),
                tableValue(tableModel, rowIndex, COLUMN_COURT),
                original.teamA(),
                original.teamB(),
                original.referee(),
                original.result(),
                original.winnerTeam(),
                original.editUrl(),
                original.editMethod(),
                original.editData(),
                tableValue(tableModel, rowIndex, COLUMN_GAME_RATING),
                tableValue(tableModel, rowIndex, COLUMN_SET_1_TEAM_A),
                tableValue(tableModel, rowIndex, COLUMN_SET_1_TEAM_B),
                tableValue(tableModel, rowIndex, COLUMN_SET_2_TEAM_A),
                tableValue(tableModel, rowIndex, COLUMN_SET_2_TEAM_B),
                tableValue(tableModel, rowIndex, COLUMN_SET_3_TEAM_A),
                tableValue(tableModel, rowIndex, COLUMN_SET_3_TEAM_B));
    }

    private String tableValue(DefaultTableModel tableModel, int rowIndex, int columnIndex) {
        Object value = tableModel.getValueAt(rowIndex, columnIndex);
        return value == null ? "" : value.toString().trim();
    }

    private List<GameRow> gameRows(List<RowSelection> rows) {
        List<GameRow> gameRows = new ArrayList<>();
        for (RowSelection row : rows) {
            gameRows.add(row.gameRow());
        }
        return gameRows;
    }

    private List<GameRow> gameRows(ScrapedPage scrapedPage) {
        List<GameRow> gameRows = new ArrayList<>();
        for (PageSection section : scrapedPage.sections()) {
            for (String paragraph : section.paragraphs()) {
                gameRows.add(GameRow.fromParagraph(paragraph));
            }
        }
        return gameRows;
    }

    private void openInBrowser(Path file) throws IOException {
        if (!Desktop.isDesktopSupported()) {
            throw new IOException("Desktop-Integration wird auf diesem System nicht unterstützt.");
        }
        Desktop.getDesktop().browse(file.toAbsolutePath().toUri());
    }

    private void openUrlInBrowser(String url) throws Exception {
        if (!Desktop.isDesktopSupported()) {
            throw new IOException("Desktop-Integration wird auf diesem System nicht unterstützt.");
        }
        Desktop.getDesktop().browse(new URI(url));
    }

    private void stopCourtDisplayUpdater() {
        if (courtDisplayUpdater != null) {
            courtDisplayUpdater.stop();
            courtDisplayUpdater = null;
        }
    }

    private void createSelectedPdf(List<RowSelection> rows, DefaultTableModel tableModel, Component parent, SheetType sheetType, SelectionControls controls) {
        List<GameRow> selectedRows = new ArrayList<>();
        List<Integer> selectedRowIndexes = new ArrayList<>();
        for (int rowIndex = 0; rowIndex < rows.size(); rowIndex++) {
            if (Boolean.TRUE.equals(tableModel.getValueAt(rowIndex, COLUMN_SELECTION))) {
                selectedRows.add(rows.get(rowIndex).gameRow());
                selectedRowIndexes.add(rowIndex);
            }
        }

        if (selectedRows.isEmpty()) {
            JOptionPane.showMessageDialog(parent, "Bitte mindestens eine Zeile auswählen.", "Keine Auswahl", JOptionPane.WARNING_MESSAGE);
            return;
        }

        Path outputFile;
        if (controls.useOutputDirectory()) {
            outputFile = Path.of(preferences.get(PREF_LAST_OUTPUT_DIR, "target")).resolve(suggestedOutputFileName(selectedRows));
        } else {
            outputFile = chooseOutputFile(parent, selectedRows);
        }

        if (outputFile == null) {
            statusLabel.setText("Abgebrochen");
            controls.setStatus("Abgebrochen");
            return;
        }
        outputFile = resolveOutputFileConflict(parent, outputFile);
        if (outputFile == null) {
            statusLabel.setText("Abgebrochen");
            controls.setStatus("Abgebrochen");
            return;
        }
        writePdf(selectedRows, outputFile, sheetType, parent, controls, () -> {
            markPrintedRows(tableModel, selectedRows, selectedRowIndexes);
            setAllRowsSelected(tableModel, false);
        });
    }

    private Path resolveOutputFileConflict(Component parent, Path outputFile) {
        if (!Files.exists(outputFile)) {
            return outputFile;
        }

        Object[] options = {"Überschreiben", "Neuen Namen verwenden", "Abbrechen"};
        int result = JOptionPane.showOptionDialog(parent,
                "Die Datei existiert bereits:\n" + outputFile.toAbsolutePath(),
                "Datei existiert bereits",
                JOptionPane.YES_NO_CANCEL_OPTION,
                JOptionPane.WARNING_MESSAGE,
                null,
                options,
                options[1]);

        if (result == 0) {
            return outputFile;
        }
        if (result == 1) {
            return nextAvailableOutputFile(outputFile);
        }
        return null;
    }

    private Path nextAvailableOutputFile(Path outputFile) {
        Path parent = outputFile.toAbsolutePath().getParent();
        String fileName = outputFile.getFileName().toString();
        int dotIndex = fileName.lastIndexOf('.');
        String baseName = dotIndex > 0 ? fileName.substring(0, dotIndex) : fileName;
        String extension = dotIndex > 0 ? fileName.substring(dotIndex) : "";

        for (int index = 2; ; index++) {
            Path candidate = parent == null
                    ? Path.of(baseName + "_" + index + extension)
                    : parent.resolve(baseName + "_" + index + extension);
            if (!Files.exists(candidate)) {
                return candidate;
            }
        }
    }

    private void setAllRowsSelected(DefaultTableModel tableModel, boolean selected) {
        for (int row = 0; row < tableModel.getRowCount(); row++) {
            tableModel.setValueAt(selected, row, COLUMN_SELECTION);
        }
    }

    private void updateSelectionCount(DefaultTableModel tableModel, JTable table, JLabel countLabel) {
        int selectedRows = 0;
        int visibleSelectedRows = 0;
        int modelRowCount = tableModel.getRowCount();
        for (int row = 0; row < modelRowCount; row++) {
            if (Boolean.TRUE.equals(tableModel.getValueAt(row, COLUMN_SELECTION))) {
                selectedRows++;
            }
        }
        for (int viewRow = 0; viewRow < table.getRowCount(); viewRow++) {
            int modelRow = table.convertRowIndexToModel(viewRow);
            if (modelRow < 0 || modelRow >= modelRowCount) {
                continue;
            }
            if (Boolean.TRUE.equals(tableModel.getValueAt(modelRow, COLUMN_SELECTION))) {
                visibleSelectedRows++;
            }
        }
        countLabel.setText(selectedRows + " ausgewählt, " + visibleSelectedRows + " von " + table.getRowCount() + " sichtbar");
    }

    private void enableDragSelection(JTable table, DefaultTableModel tableModel) {
        MouseAdapter mouseAdapter = new MouseAdapter() {
            private int lastModelRow = -1;

            @Override
            public void mousePressed(MouseEvent event) {
                if (MouseEvent.BUTTON1 == event.getButton()) {
                    lastModelRow = -1;
                    selectRowAt(event);
                }
            }

            @Override
            public void mouseDragged(MouseEvent event) {
                if ((event.getModifiersEx() & MouseEvent.BUTTON1_DOWN_MASK) != 0) {
                    selectRowAt(event);
                }
            }

            @Override
            public void mouseReleased(MouseEvent event) {
                lastModelRow = -1;
            }

            private void selectRowAt(MouseEvent event) {
                int viewRow = table.rowAtPoint(event.getPoint());
                if (viewRow < 0) {
                    return;
                }
                int viewColumn = table.columnAtPoint(event.getPoint());
                if (viewColumn >= 0 && table.convertColumnIndexToModel(viewColumn) == COLUMN_EDIT) {
                    return;
                }

                int modelRow = table.convertRowIndexToModel(viewRow);
                if (modelRow != lastModelRow) {
                    tableModel.setValueAt(Boolean.TRUE, modelRow, COLUMN_SELECTION);
                    lastModelRow = modelRow;
                }
            }
        };

        table.addMouseListener(mouseAdapter);
        table.addMouseMotionListener(mouseAdapter);
    }

    private TableRowSorter<DefaultTableModel> createRowSorter(DefaultTableModel tableModel) {
        TableRowSorter<DefaultTableModel> sorter = new TableRowSorter<>(tableModel);
        Comparator<String> naturalComparator = this::compareNaturally;
        sorter.setComparator(COLUMN_NUMBER, naturalComparator);
        sorter.setComparator(COLUMN_COURT, naturalComparator);
        return sorter;
    }

    private void applyCompletedGamesFilter(TableRowSorter<DefaultTableModel> sorter, boolean showCompletedGames) {
        if (showCompletedGames) {
            sorter.setRowFilter(null);
            return;
        }
        sorter.setRowFilter(new RowFilter<>() {
            @Override
            public boolean include(Entry<? extends DefaultTableModel, ? extends Integer> entry) {
                return entry.getStringValue(COLUMN_STATUS).isBlank();
            }
        });
    }

    private void applyDefaultGameSort(TableRowSorter<DefaultTableModel> sorter) {
        sorter.setSortKeys(List.of(new javax.swing.RowSorter.SortKey(COLUMN_NUMBER, javax.swing.SortOrder.ASCENDING)));
    }

    private int compareNaturally(String first, String second) {
        String left = first == null ? "" : first;
        String right = second == null ? "" : second;
        Integer leftNumber = leadingNumber(left);
        Integer rightNumber = leadingNumber(right);
        if (leftNumber != null && rightNumber != null) {
            int numberComparison = leftNumber.compareTo(rightNumber);
            if (numberComparison != 0) {
                return numberComparison;
            }
        }
        return left.compareToIgnoreCase(right);
    }

    private Integer leadingNumber(String value) {
        StringBuilder digits = new StringBuilder();
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            if (Character.isDigit(character)) {
                digits.append(character);
            } else if (digits.length() > 0) {
                break;
            }
        }
        if (digits.length() == 0) {
            return null;
        }
        try {
            return Integer.parseInt(digits.toString());
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private void writePdf(List<GameRow> selectedRows, Path outputFile, SheetType sheetType, Component parent, SelectionControls controls, Runnable afterSuccess) {
        setBusy(true);
        statusLabel.setText("PDF-Datei wird erzeugt...");
        controls.setBusy(true);
        controls.setStatus("PDF-Datei wird erzeugt...");

        SwingWorker<Path, Void> worker = new SwingWorker<>() {
            @Override
            protected Path doInBackground() throws Exception {
                PdfFormWriter writer = new PdfFormWriter();
                return sheetType == SheetType.EASY
                        ? writer.writeMergedEasyForm(selectedRows, outputFile)
                        : writer.writeMergedForm(selectedRows, outputFile);
            }

            @Override
            protected void done() {
                setBusy(false);
                controls.setBusy(false);
                try {
                    Path writtenFile = get();
                    statusLabel.setText("Fertig: " + writtenFile);
                    afterSuccess.run();
                    controls.setLastOutputFile(writtenFile);
                    controls.setStatus("PDF-Datei wurde erzeugt: " + writtenFile);
                } catch (Exception exception) {
                    statusLabel.setText("Fehler");
                    String message = userFriendlyMessage(Task.WRITE_PDF, exception);
                    controls.setStatus("Fehler: " + message);
                    showErrorDialog(parent, "Fehler beim Erzeugen der PDF-Datei", message, exception);
                }
            }
        };
        worker.execute();
    }

    private void markPrintedRows(DefaultTableModel tableModel, List<GameRow> printedRows, List<Integer> printedRowIndexes) {
        for (GameRow gameRow : printedRows) {
            printedGameKeys.add(gameKey(gameRow));
        }
        storePrintedGameKeys();
        for (Integer rowIndex : printedRowIndexes) {
            if (rowIndex >= 0 && rowIndex < tableModel.getRowCount()) {
                tableModel.setValueAt("Ja", rowIndex, COLUMN_PRINTED);
            }
        }
    }

    private String gameKey(GameRow gameRow) {
        return normalizeKeyPart(gameRow.number())
                + "\u001f" + normalizeKeyPart(gameRow.date())
                + "\u001f" + normalizeKeyPart(gameRow.court())
                + "\u001f" + normalizeKeyPart(gameRow.teamA())
                + "\u001f" + normalizeKeyPart(gameRow.teamB());
    }

    private String normalizeKeyPart(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }

    private void loadPrintedGameKeys() {
        printedGameKeys.clear();
        String storedKeys = preferences.get(PREF_PRINTED_GAME_KEYS, "");
        if (storedKeys.isBlank()) {
            return;
        }
        Base64.Decoder decoder = Base64.getUrlDecoder();
        for (String storedKey : storedKeys.split(",")) {
            if (storedKey.isBlank()) {
                continue;
            }
            try {
                printedGameKeys.add(new String(decoder.decode(storedKey), StandardCharsets.UTF_8));
            } catch (IllegalArgumentException ignored) {
                // Ignore malformed legacy entries and keep the rest of the printed history.
            }
        }
    }

    private void storePrintedGameKeys() {
        Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
        List<String> encodedKeys = new ArrayList<>();
        for (String printedGameKey : printedGameKeys) {
            encodedKeys.add(encoder.encodeToString(printedGameKey.getBytes(StandardCharsets.UTF_8)));
        }
        try {
            preferences.put(PREF_PRINTED_GAME_KEYS, String.join(",", encodedKeys));
        } catch (IllegalArgumentException ignored) {
            // Keep the in-memory printed state even if the platform preference value limit is reached.
        }
    }

    private String suggestedOutputFileName(List<GameRow> selectedRows) {
        StringBuilder name = new StringBuilder("Spiel");
        for (int index = 0; index < selectedRows.size(); index++) {
            String number = selectedRows.get(index).number();
            name.append('_').append(sanitizeFilePart(number.isBlank() ? String.valueOf(index + 1) : number));
        }
        name.append(".pdf");
        return name.toString();
    }

    private String sanitizeFilePart(String value) {
        String sanitized = value.replaceAll("[^A-Za-z0-9._-]+", "_");
        return sanitized.isBlank() ? "Spiel" : sanitized;
    }

    private String encryptPassword(String password) {
        if (password == null || password.isBlank()) {
            return "";
        }
        try {
            byte[] iv = new byte[GCM_IV_LENGTH];
            new SecureRandom().nextBytes(iv);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, passwordKey(), new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv));
            byte[] encryptedPassword = cipher.doFinal(password.getBytes(StandardCharsets.UTF_8));

            byte[] payload = new byte[iv.length + encryptedPassword.length];
            System.arraycopy(iv, 0, payload, 0, iv.length);
            System.arraycopy(encryptedPassword, 0, payload, iv.length, encryptedPassword.length);
            return Base64.getEncoder().encodeToString(payload);
        } catch (Exception exception) {
            throw new IllegalStateException("Passwort konnte nicht verschlüsselt gespeichert werden.", exception);
        }
    }

    private String decryptPassword(String encryptedPassword) {
        if (encryptedPassword == null || encryptedPassword.isBlank()) {
            return "";
        }
        try {
            byte[] payload = Base64.getDecoder().decode(encryptedPassword);
            if (payload.length <= GCM_IV_LENGTH) {
                return "";
            }

            byte[] iv = java.util.Arrays.copyOfRange(payload, 0, GCM_IV_LENGTH);
            byte[] encryptedBytes = java.util.Arrays.copyOfRange(payload, GCM_IV_LENGTH, payload.length);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, passwordKey(), new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv));
            return new String(cipher.doFinal(encryptedBytes), StandardCharsets.UTF_8);
        } catch (Exception exception) {
            preferences.remove(PREF_PASSWORD_ENCRYPTED);
            return "";
        }
    }

    private SecretKeySpec passwordKey() throws Exception {
        String keyMaterial = PASSWORD_KEY_SALT
                + "|" + System.getProperty("user.name", "")
                + "|" + System.getProperty("user.home", "");
        byte[] keyBytes = MessageDigest.getInstance("SHA-256").digest(keyMaterial.getBytes(StandardCharsets.UTF_8));
        return new SecretKeySpec(keyBytes, "AES");
    }

    private void setBusy(boolean busy) {
        urlField.setEnabled(!busy);
        hvvScheduleUrlField.setEnabled(!busy);
        openEditUrlButton.setEnabled(!busy);
        openHvvScheduleUrlButton.setEnabled(!busy);
        usernameField.setEnabled(!busy);
        passwordField.setEnabled(!busy);
        rememberCheckBox.setEnabled(!busy);
        generateButton.setEnabled(!busy);
        progressBar.setVisible(busy);
    }

    private boolean isWebUrl(String value) {
        return value.startsWith("http://") || value.startsWith("https://");
    }

    private String userFriendlyMessage(Task task, Exception exception) {
        Throwable cause = rootCause(exception);
        String rootMessage = cause.getMessage() == null ? cause.toString() : cause.getMessage();

        if (cause instanceof UnknownHostException) {
            return "Die Adresse konnte nicht gefunden werden. Bitte URL und Netzwerkverbindung prüfen.";
        }
        if (cause instanceof SocketTimeoutException) {
            return "Die Verbindung hat zu lange gedauert. Bitte später erneut versuchen oder die Netzwerkverbindung prüfen.";
        }
        if (cause instanceof ConnectException || cause instanceof NoRouteToHostException) {
            return "Die Seite ist nicht erreichbar. Bitte Netzwerkverbindung, VPN oder Serverstatus prüfen.";
        }
        if (rootMessage.toLowerCase().contains("anmeldung fehlgeschlagen")
                || rootMessage.toLowerCase().contains("loginformular")) {
            return "Login fehlgeschlagen. Bitte Benutzername und Passwort prüfen.";
        }
        if (task == Task.LOAD_GAMES && rootMessage.toLowerCase().contains("keine zeilen")) {
            return "Keine Spiele gefunden. Bitte prüfen, ob die geladene Seite eine Spieleliste enthält.";
        }
        if (task == Task.WRITE_PDF && rootMessage.toLowerCase().contains("pdf-vorlage")) {
            return "Die PDF-Vorlage fehlt oder konnte nicht gelesen werden.";
        }
        if (task == Task.WRITE_PDF && rootMessage.toLowerCase().contains("formularfeld")) {
            return "Die PDF-Vorlage passt nicht zu den erwarteten Formularfeldern.";
        }
        if (task == Task.WRITE_PDF && cause instanceof IOException) {
            return "Die PDF-Datei konnte nicht geschrieben werden. Bitte Zielordner und Schreibrechte prüfen. Details: " + rootMessage;
        }
        if (task == Task.WRITE_HTML && cause instanceof IOException) {
            return "Die HTML-Anzeige konnte nicht geschrieben oder geöffnet werden. Details: " + rootMessage;
        }
        if (task == Task.SAVE_GAME) {
            return "Die Spieländerungen konnten nicht gespeichert werden. Details: " + rootMessage;
        }
        if (task == Task.OPEN_URL) {
            return "Die URL konnte nicht im Browser geöffnet werden. Details: " + rootMessage;
        }
        if (task == Task.LOAD_GAMES) {
            return "Die Spiele konnten nicht geladen werden. Details: " + rootMessage;
        }
        return rootMessage;
    }

    private void showErrorDialog(Component parent, String title, String message, Exception exception) {
        Window owner = SwingUtilities.getWindowAncestor(parent);
        JDialog dialog = owner == null ? new JDialog(this, title, true) : new JDialog(owner, title, Dialog.ModalityType.APPLICATION_MODAL);
        dialog.setDefaultCloseOperation(JDialog.DISPOSE_ON_CLOSE);

        JLabel messageLabel = new JLabel("<html><body style='width: 420px'>" + escapeHtml(message) + "</body></html>");
        messageLabel.setBorder(new EmptyBorder(0, 0, 8, 0));

        JTextArea detailsArea = new JTextArea(stackTrace(exception), 12, 72);
        detailsArea.setEditable(false);
        detailsArea.setLineWrap(false);
        JScrollPane detailsScrollPane = new JScrollPane(detailsArea);
        detailsScrollPane.setVisible(false);

        JButton detailsButton = new JButton("Details anzeigen");
        JButton closeButton = new JButton("Schließen");
        detailsButton.addActionListener(event -> {
            boolean showDetails = !detailsScrollPane.isVisible();
            detailsScrollPane.setVisible(showDetails);
            detailsButton.setText(showDetails ? "Details ausblenden" : "Details anzeigen");
            dialog.pack();
            dialog.setLocationRelativeTo(parent);
        });
        closeButton.addActionListener(event -> dialog.dispose());

        JPanel buttonPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT, 6, 0));
        buttonPanel.add(detailsButton);
        buttonPanel.add(closeButton);

        JPanel contentPanel = new JPanel(new BorderLayout(0, 8));
        contentPanel.setBorder(new EmptyBorder(14, 14, 14, 14));
        contentPanel.add(messageLabel, BorderLayout.NORTH);
        contentPanel.add(detailsScrollPane, BorderLayout.CENTER);
        contentPanel.add(buttonPanel, BorderLayout.SOUTH);

        dialog.setContentPane(contentPanel);
        dialog.getRootPane().setDefaultButton(closeButton);
        dialog.pack();
        dialog.setLocationRelativeTo(parent);
        dialog.setVisible(true);
    }

    private String stackTrace(Exception exception) {
        StringWriter writer = new StringWriter();
        exception.printStackTrace(new PrintWriter(writer));
        return writer.toString();
    }

    private String escapeHtml(String value) {
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\n", "<br>");
    }

    private Throwable rootCause(Exception exception) {
        Throwable cause = exception;
        while (cause.getCause() != null) {
            cause = cause.getCause();
        }
        return cause;
    }

    private static class RowSelection {
        private final String sectionHeading;
        private final GameRow gameRow;
        private boolean dirty;

        private RowSelection(String sectionHeading, GameRow gameRow) {
            this.sectionHeading = sectionHeading;
            this.gameRow = gameRow;
        }

        private String sectionHeading() {
            return sectionHeading;
        }

        private GameRow gameRow() {
            return gameRow;
        }

        private boolean isDirty() {
            return dirty;
        }

        private void setDirty(boolean dirty) {
            this.dirty = dirty;
        }
    }

    private class CourtDisplayUpdater {
        private final String sourceUrl;
        private final String username;
        private final String password;
        private final List<RowSelection> rows;
        private final DefaultTableModel tableModel;
        private final TableRowSorter<DefaultTableModel> sorter;
        private final SelectionControls controls;
        private final Timer timer;
        private boolean updateRunning;
        private int secondsUntilRefresh = COURT_DISPLAY_REFRESH_MILLIS / 1000;

        private CourtDisplayUpdater(
                String sourceUrl,
                String username,
                String password,
                List<RowSelection> rows,
                DefaultTableModel tableModel,
                TableRowSorter<DefaultTableModel> sorter,
                SelectionControls controls) {
            this.sourceUrl = sourceUrl;
            this.username = username;
            this.password = password;
            this.rows = rows;
            this.tableModel = tableModel;
            this.sorter = sorter;
            this.controls = controls;
            this.timer = new Timer(1_000, event -> tick());
            this.timer.setInitialDelay(0);
        }

        private void start() {
            updateCountdownLabel();
            timer.start();
        }

        private void stop() {
            timer.stop();
            controls.setRefreshCountdown("");
        }

        private void tick() {
            if (!controls.isAutomaticRefreshEnabled()) {
                secondsUntilRefresh = COURT_DISPLAY_REFRESH_MILLIS / 1000;
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
                    List<RowSelection> refreshedRows = rowSelections(scrapedPage);
                    Path displayFile = new CourtDisplayWriter().write(gameRows(scrapedPage), COURT_DISPLAY_FILE, lastLoadedHvvScheduleUrl, java.time.Instant.now(), true);
                    return new CourtDisplayRefreshResult(displayFile, refreshedRows, result.loginStatus());
                }

                @Override
                protected void done() {
                    updateRunning = false;
                    secondsUntilRefresh = COURT_DISPLAY_REFRESH_MILLIS / 1000;
                    try {
                        CourtDisplayRefreshResult result = get();
                        replaceRows(rows, tableModel, sorter, result.rows());
                        statusLabel.setText("Spiele automatisch aktualisiert");
                        controls.setStatus("Automatisch aktualisiert: " + rows.size()
                                + " Spiele. HTML aktualisiert: " + result.displayFile()
                                + ". " + loginStatusText(result.loginStatus()));
                    } catch (Exception exception) {
                        controls.setStatus("HTML-Aktualisierung fehlgeschlagen: "
                                + userFriendlyMessage(Task.LOAD_GAMES, exception));
                    }
                    updateCountdownLabel();
                }
            };
            worker.execute();
        }
    }

    private static class CourtDisplayRefreshResult {
        private final Path displayFile;
        private final List<RowSelection> rows;
        private final WebPageScraper.LoginStatus loginStatus;

        private CourtDisplayRefreshResult(Path displayFile, List<RowSelection> rows, WebPageScraper.LoginStatus loginStatus) {
            this.displayFile = displayFile;
            this.rows = rows;
            this.loginStatus = loginStatus;
        }

        private Path displayFile() {
            return displayFile;
        }

        private List<RowSelection> rows() {
            return rows;
        }

        private WebPageScraper.LoginStatus loginStatus() {
            return loginStatus;
        }
    }

    private static class ManualRefreshResult {
        private final WebPageScraper.ScrapeResult scrapeResult;
        private final Path displayFile;

        private ManualRefreshResult(WebPageScraper.ScrapeResult scrapeResult, Path displayFile) {
            this.scrapeResult = scrapeResult;
            this.displayFile = displayFile;
        }

        private WebPageScraper.ScrapeResult scrapeResult() {
            return scrapeResult;
        }

        private Path displayFile() {
            return displayFile;
        }
    }

    private class SelectionControls {
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

        private SelectionControls(
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

        private boolean useOutputDirectory() {
            return outputDirectoryCheckBox.isSelected();
        }

        private void setBusy(boolean busy) {
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

        private void setCourtDisplayBusy(boolean busy) {
            this.busy = busy;
            courtDisplayButton.setEnabled(!busy);
            saveQuickEditsButton.setEnabled(!busy);
            automaticRefreshCheckBox.setEnabled(!busy);
            updateRefreshButtonState();
            progressBar.setVisible(busy);
        }

        private void setCourtDisplayStarted() {
            courtDisplayButton.setText("HTML Anzeige neu starten");
            courtDisplayButton.setEnabled(true);
        }

        private void setStatus(String status) {
            statusLabel.setText(status);
        }

        private void setRefreshCountdown(String status) {
            refreshCountdownLabel.setText(status == null ? "" : status);
        }

        private boolean isAutomaticRefreshEnabled() {
            return automaticRefreshCheckBox.isSelected();
        }

        private void updateRefreshMode() {
            if (isAutomaticRefreshEnabled()) {
                setRefreshCountdown("Automatische Aktualisierung aktiv");
            } else {
                setRefreshCountdown("Automatische Aktualisierung aus");
            }
            updateRefreshButtonState();
        }

        private void updateRefreshButtonState() {
            refreshGamesButton.setEnabled(!busy && !isAutomaticRefreshEnabled());
        }

        private void setLastOutputFile(Path lastOutputFile) {
            this.lastOutputFile = lastOutputFile;
            openOutputDirectoryButton.setEnabled(lastOutputFile != null);
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
                // The status already shows the generated file path; opening the folder is only a convenience.
            }
        }
    }

    private enum Task {
        LOAD_GAMES,
        SAVE_GAME,
        WRITE_PDF,
        WRITE_HTML,
        OPEN_URL
    }

    private enum SheetType {
        NORMAL,
        EASY
    }

    private static class GameTableRenderer extends DefaultTableCellRenderer {
        @Override
        public Component getTableCellRendererComponent(JTable table, Object value, boolean isSelected, boolean hasFocus, int row, int column) {
            Component component = super.getTableCellRendererComponent(table, value, isSelected, hasFocus, row, column);
            if (!isSelected) {
                int modelRow = table.convertRowIndexToModel(row);
                Object status = table.getModel().getValueAt(modelRow, COLUMN_STATUS);
                boolean completed = status != null && !status.toString().isBlank();
                component.setBackground(completed ? new Color(232, 232, 232) : row % 2 == 0 ? Color.WHITE : TABLE_STRIPE_COLOR);
                component.setForeground(completed ? MUTED_TEXT_COLOR : Color.BLACK);
            } else {
                component.setForeground(Color.BLACK);
            }
            setBorder(new EmptyBorder(0, 6, 0, 6));
            return component;
        }
    }

    private static class ButtonCellRenderer extends JButton implements TableCellRenderer {
        private ButtonCellRenderer(String text) {
            super(text);
            setFocusPainted(false);
        }

        @Override
        public Component getTableCellRendererComponent(JTable table, Object value, boolean isSelected, boolean hasFocus, int row, int column) {
            setText(value == null || value.toString().isBlank() ? "Bearbeiten" : value.toString());
            setEnabled(table.isEnabled());
            return this;
        }
    }
}
