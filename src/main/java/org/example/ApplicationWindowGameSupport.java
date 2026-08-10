package org.example;

import javax.swing.JComboBox;
import javax.swing.JLabel;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JTable;
import javax.swing.JTextField;
import javax.swing.event.TableModelEvent;
import javax.swing.table.DefaultTableModel;
import javax.swing.table.TableRowSorter;
import java.awt.Component;
import java.awt.GridBagConstraints;
import java.awt.GridBagLayout;
import java.awt.Insets;
import java.util.ArrayList;
import java.util.List;

final class ApplicationWindowGameSupport {
    private ApplicationWindowGameSupport() {
    }

    static List<RowSelection> rowSelections(ScrapedPage scrapedPage) {
        List<RowSelection> rows = new ArrayList<>();
        for (PageSection section : scrapedPage.sections()) {
            for (String paragraph : section.paragraphs()) {
                rows.add(new RowSelection(section.heading(), GameRow.fromParagraph(paragraph)));
            }
        }
        return rows;
    }

    static Object[] tableRow(GameRow gameRow, int columnSelection, int columnStatus, String printedLabel) {
        return new Object[]{
                Boolean.FALSE,
                gameRow.number(),
                gameRow.court(),
                gameRow.teamA(),
                gameRow.teamB(),
                gameRow.referee(),
                gameRow.result(),
                printedLabel,
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

    static void replaceRows(List<RowSelection> rows, DefaultTableModel tableModel, TableRowSorter<DefaultTableModel> sorter, List<RowSelection> refreshedRows, java.util.function.Consumer<TableRowSorter<DefaultTableModel>> sortApplier, java.util.function.Function<GameRow, Object[]> rowMapper) {
        sorter.setSortKeys(List.of());
        tableModel.setRowCount(0);
        for (RowSelection row : refreshedRows) {
            tableModel.addRow(rowMapper.apply(row.gameRow()));
        }
        rows.clear();
        rows.addAll(refreshedRows);
        sortApplier.accept(sorter);
    }

    static List<GameRow> gameRows(List<RowSelection> rows) {
        List<GameRow> gameRows = new ArrayList<>();
        for (RowSelection row : rows) {
            gameRows.add(row.gameRow());
        }
        return gameRows;
    }

    static List<GameRow> gameRows(ScrapedPage scrapedPage) {
        List<GameRow> gameRows = new ArrayList<>();
        for (PageSection section : scrapedPage.sections()) {
            for (String paragraph : section.paragraphs()) {
                gameRows.add(GameRow.fromParagraph(paragraph));
            }
        }
        return gameRows;
    }

    static boolean isQuickEditColumn(int column, int columnCourt, int columnGameRating, int columnSet1TeamA, int columnSet1TeamB, int columnSet2TeamA, int columnSet2TeamB, int columnSet3TeamA, int columnSet3TeamB) {
        return column == columnCourt
                || column == columnGameRating
                || column == columnSet1TeamA
                || column == columnSet1TeamB
                || column == columnSet2TeamA
                || column == columnSet2TeamB
                || column == columnSet3TeamA
                || column == columnSet3TeamB;
    }

    static boolean isSetScoreColumn(int column, int columnSet1TeamA, int columnSet1TeamB, int columnSet2TeamA, int columnSet2TeamB, int columnSet3TeamA, int columnSet3TeamB) {
        return column == columnSet1TeamA
                || column == columnSet1TeamB
                || column == columnSet2TeamA
                || column == columnSet2TeamB
                || column == columnSet3TeamA
                || column == columnSet3TeamB;
    }

    static void markQuickEditChange(List<RowSelection> rows, DefaultTableModel tableModel, TableModelEvent event, String defaultGameRating, int columnGameRating, int columnSaveStatus, int columnCourt, int columnSet1TeamA, int columnSet1TeamB, int columnSet2TeamA, int columnSet2TeamB, int columnSet3TeamA, int columnSet3TeamB) {
        if (event.getType() != TableModelEvent.UPDATE || event.getFirstRow() < 0) {
            return;
        }
        int column = event.getColumn();
        if (!isQuickEditColumn(column, columnCourt, columnGameRating, columnSet1TeamA, columnSet1TeamB, columnSet2TeamA, columnSet2TeamB, columnSet3TeamA, columnSet3TeamB)) {
            return;
        }
        for (int row = event.getFirstRow(); row <= event.getLastRow() && row < rows.size(); row++) {
            if (isSetScoreColumn(column, columnSet1TeamA, columnSet1TeamB, columnSet2TeamA, columnSet2TeamB, columnSet3TeamA, columnSet3TeamB)
                    && tableValue(tableModel, row, columnGameRating).isBlank()
                    && hasAnySetScore(tableModel, row, columnSet1TeamA, columnSet1TeamB, columnSet2TeamA, columnSet2TeamB, columnSet3TeamA, columnSet3TeamB)) {
                tableModel.setValueAt(defaultGameRating, row, columnGameRating);
            }
            rows.get(row).setDirty(true);
            tableModel.setValueAt("Geändert", row, columnSaveStatus);
        }
    }

    static boolean hasAnySetScore(DefaultTableModel tableModel, int row, int columnSet1TeamA, int columnSet1TeamB, int columnSet2TeamA, int columnSet2TeamB, int columnSet3TeamA, int columnSet3TeamB) {
        return !tableValue(tableModel, row, columnSet1TeamA).isBlank()
                || !tableValue(tableModel, row, columnSet1TeamB).isBlank()
                || !tableValue(tableModel, row, columnSet2TeamA).isBlank()
                || !tableValue(tableModel, row, columnSet2TeamB).isBlank()
                || !tableValue(tableModel, row, columnSet3TeamA).isBlank()
                || !tableValue(tableModel, row, columnSet3TeamB).isBlank();
    }

    static GameEditUpdate gameEditUpdate(GameRow original, DefaultTableModel tableModel, int rowIndex, int columnCourt, int columnGameRating, int columnSet1TeamA, int columnSet1TeamB, int columnSet2TeamA, int columnSet2TeamB, int columnSet3TeamA, int columnSet3TeamB) {
        return new GameEditUpdate(
                original.editUrl(),
                original.editMethod(),
                original.editData(),
                tableValue(tableModel, rowIndex, columnCourt),
                tableValue(tableModel, rowIndex, columnGameRating),
                tableValue(tableModel, rowIndex, columnSet1TeamA),
                tableValue(tableModel, rowIndex, columnSet1TeamB),
                tableValue(tableModel, rowIndex, columnSet2TeamA),
                tableValue(tableModel, rowIndex, columnSet2TeamB),
                tableValue(tableModel, rowIndex, columnSet3TeamA),
                tableValue(tableModel, rowIndex, columnSet3TeamB));
    }

    static GameRow updatedGameRow(GameRow original, DefaultTableModel tableModel, int rowIndex, int columnCourt, int columnGameRating, int columnSet1TeamA, int columnSet1TeamB, int columnSet2TeamA, int columnSet2TeamB, int columnSet3TeamA, int columnSet3TeamB) {
        return new GameRow(
                original.number(),
                original.round(),
                original.date(),
                tableValue(tableModel, rowIndex, columnCourt),
                original.teamA(),
                original.teamB(),
                original.referee(),
                original.result(),
                original.winnerTeam(),
                original.editUrl(),
                original.editMethod(),
                original.editData(),
                tableValue(tableModel, rowIndex, columnGameRating),
                tableValue(tableModel, rowIndex, columnSet1TeamA),
                tableValue(tableModel, rowIndex, columnSet1TeamB),
                tableValue(tableModel, rowIndex, columnSet2TeamA),
                tableValue(tableModel, rowIndex, columnSet2TeamB),
                tableValue(tableModel, rowIndex, columnSet3TeamA),
                tableValue(tableModel, rowIndex, columnSet3TeamB));
    }

    static String tableValue(DefaultTableModel tableModel, int rowIndex, int columnIndex) {
        Object value = tableModel.getValueAt(rowIndex, columnIndex);
        return value == null ? "" : value.toString().trim();
    }

    static void showGameEditDialog(List<RowSelection> rows, DefaultTableModel tableModel, int modelRow, Component parent, GameEditUpdate editValues, String[] gameRatingOptions, String defaultGameRating, int columnCourt, int columnGameRating, int columnSet1TeamA, int columnSet1TeamB, int columnSet2TeamA, int columnSet2TeamB, int columnSet3TeamA, int columnSet3TeamB, int columnSaveStatus) {
        if (modelRow < 0 || modelRow >= rows.size()) {
            return;
        }

        GameRow gameRow = rows.get(modelRow).gameRow();
        JTextField courtField = new JTextField(firstNonBlank(editValues.court(), gameRow.court(), tableValue(tableModel, modelRow, columnCourt)), 8);
        JComboBox<String> ratingComboBox = new JComboBox<>(gameRatingOptions);
        ratingComboBox.setSelectedItem(firstNonBlank(editValues.gameRating(), gameRow.gameRating(), tableValue(tableModel, modelRow, columnGameRating)));
        String[] resultScores = setScoresFromResult(gameRow.result());
        JTextField set1TeamAField = new JTextField(firstNonBlank(editValues.set1TeamA(), gameRow.set1TeamA(), tableValue(tableModel, modelRow, columnSet1TeamA), resultScores[0]), 5);
        JTextField set1TeamBField = new JTextField(firstNonBlank(editValues.set1TeamB(), gameRow.set1TeamB(), tableValue(tableModel, modelRow, columnSet1TeamB), resultScores[1]), 5);
        JTextField set2TeamAField = new JTextField(firstNonBlank(editValues.set2TeamA(), gameRow.set2TeamA(), tableValue(tableModel, modelRow, columnSet2TeamA), resultScores[2]), 5);
        JTextField set2TeamBField = new JTextField(firstNonBlank(editValues.set2TeamB(), gameRow.set2TeamB(), tableValue(tableModel, modelRow, columnSet2TeamB), resultScores[3]), 5);
        JTextField set3TeamAField = new JTextField(firstNonBlank(editValues.set3TeamA(), gameRow.set3TeamA(), tableValue(tableModel, modelRow, columnSet3TeamA), resultScores[4]), 5);
        JTextField set3TeamBField = new JTextField(firstNonBlank(editValues.set3TeamB(), gameRow.set3TeamB(), tableValue(tableModel, modelRow, columnSet3TeamB), resultScores[5]), 5);

        JPanel panel = new JPanel(new GridBagLayout());
        panel.setBorder(javax.swing.BorderFactory.createEmptyBorder(8, 8, 8, 8));
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
            rating = defaultGameRating;
        }

        tableModel.setValueAt(courtField.getText().trim(), modelRow, columnCourt);
        tableModel.setValueAt(rating, modelRow, columnGameRating);
        tableModel.setValueAt(set1TeamAField.getText().trim(), modelRow, columnSet1TeamA);
        tableModel.setValueAt(set1TeamBField.getText().trim(), modelRow, columnSet1TeamB);
        tableModel.setValueAt(set2TeamAField.getText().trim(), modelRow, columnSet2TeamA);
        tableModel.setValueAt(set2TeamBField.getText().trim(), modelRow, columnSet2TeamB);
        tableModel.setValueAt(set3TeamAField.getText().trim(), modelRow, columnSet3TeamA);
        tableModel.setValueAt(set3TeamBField.getText().trim(), modelRow, columnSet3TeamB);

        RowSelection previous = rows.get(modelRow);
        RowSelection updated = new RowSelection(previous.sectionHeading(), updatedGameRow(previous.gameRow(), tableModel, modelRow, columnCourt, columnGameRating, columnSet1TeamA, columnSet1TeamB, columnSet2TeamA, columnSet2TeamB, columnSet3TeamA, columnSet3TeamB));
        updated.setDirty(true);
        rows.set(modelRow, updated);
        tableModel.setValueAt("Geändert", modelRow, columnSaveStatus);
    }

    private static void addEditField(JPanel panel, GridBagConstraints constraints, int row, String label, Component field) {
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

    private static JPanel createGameTeamsPanel(GameRow gameRow) {
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
        panel.add(new JLabel("Team A: " + gameRow.teamA()), constraints);
        constraints.gridy = 2;
        panel.add(new JLabel("Team B: " + gameRow.teamB()), constraints);
        return panel;
    }

    private static void addScoreHeader(JPanel panel, GridBagConstraints constraints) {
        JLabel teamALabel = new JLabel("Team A");
        JLabel teamBLabel = new JLabel("Team B");
        teamALabel.setFont(teamALabel.getFont().deriveFont(java.awt.Font.BOLD));
        teamBLabel.setFont(teamBLabel.getFont().deriveFont(java.awt.Font.BOLD));
        constraints.gridy = 0;
        constraints.gridx = 1;
        panel.add(teamALabel, constraints);
        constraints.gridx = 2;
        panel.add(teamBLabel, constraints);
    }

    private static void addScoreField(JPanel panel, GridBagConstraints constraints, int row, String label, JTextField teamAField, JTextField teamBField) {
        constraints.gridy = row;
        constraints.gridx = 0;
        panel.add(new JLabel(label), constraints);
        constraints.gridx = 1;
        panel.add(teamAField, constraints);
        constraints.gridx = 2;
        panel.add(teamBField, constraints);
    }

    private static String selectedValue(JComboBox<String> comboBox) {
        Object selectedItem = comboBox.getSelectedItem();
        return selectedItem == null ? "" : selectedItem.toString().trim();
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.trim().isBlank()) {
                return value.trim();
            }
        }
        return "";
    }

    private static String[] setScoresFromResult(String result) {
        String[] scores = {"", "", "", "", "", ""};
        if (result == null || result.isBlank()) {
            return scores;
        }
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("(\\d{1,2})\\s*[:\\-]\\s*(\\d{1,2})").matcher(result);
        int index = 0;
        while (matcher.find() && index < scores.length) {
            scores[index++] = matcher.group(1);
            scores[index++] = matcher.group(2);
        }
        return scores;
    }

    private static boolean hasAnySetScore(String... values) {
        for (String value : values) {
            if (value != null && !value.trim().isBlank()) {
                return true;
            }
        }
        return false;
    }
}
