package org.example;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.multipdf.PDFMergerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

public class PdfFormWriter {
    private static final String TEMPLATE_RESOURCE = "/spielberichtsbogen_Formular.pdf";
    private static final String EASY_TEMPLATE_RESOURCE = "/spielberichtsbogen_Formular_easy05.pdf";

    public List<Path> writeForms(List<GameRow> rows, Path outputDirectory) throws IOException {
        if (rows.isEmpty()) {
            throw new IOException("Keine ausgewählten Zeilen vorhanden.");
        }

        Files.createDirectories(outputDirectory);

        List<Path> outputFiles = new java.util.ArrayList<>();
        for (int index = 0; index < rows.size(); index++) {
            Path rowOutputFile = outputPathFor(outputDirectory, rows.get(index), index);
            writeForm(rows.get(index), rowOutputFile);
            outputFiles.add(rowOutputFile.toAbsolutePath());
        }
        return outputFiles;
    }

    public Path writeMergedForm(List<GameRow> rows, Path outputFile) throws IOException {
        if (rows.isEmpty()) {
            throw new IOException("Keine ausgewählten Zeilen vorhanden.");
        }

        Path parent = outputFile.toAbsolutePath().getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }

        Path tempDirectory = Files.createTempDirectory("courtboard-merge-");
        tempDirectory.toFile().deleteOnExit();
        List<Path> formFiles = writeForms(rows, tempDirectory);

        PDFMergerUtility merger = new PDFMergerUtility();
        merger.setDestinationFileName(outputFile.toString());
        for (Path formFile : formFiles) {
            formFile.toFile().deleteOnExit();
            merger.addSource(formFile.toFile());
        }
        merger.mergeDocuments(null);
        return outputFile.toAbsolutePath();
    }

    public Path writeMergedEasyForm(List<GameRow> rows, Path outputFile) throws IOException {
        if (rows.isEmpty()) {
            throw new IOException("Keine ausgewählten Zeilen vorhanden.");
        }

        Path parent = outputFile.toAbsolutePath().getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }

        Path tempDirectory = Files.createTempDirectory("courtboard-easy-merge-");
        tempDirectory.toFile().deleteOnExit();

        List<Path> formFiles = new java.util.ArrayList<>();
        for (int index = 0; index < rows.size(); index += 2) {
            Path easyFile = tempDirectory.resolve("easy_" + (index / 2 + 1) + ".pdf");
            GameRow firstRow = rows.get(index);
            GameRow secondRow = index + 1 < rows.size() ? rows.get(index + 1) : null;
            writeEasyForm(firstRow, secondRow, easyFile);
            easyFile.toFile().deleteOnExit();
            formFiles.add(easyFile);
        }

        PDFMergerUtility merger = new PDFMergerUtility();
        merger.setDestinationFileName(outputFile.toString());
        for (Path formFile : formFiles) {
            merger.addSource(formFile.toFile());
        }
        merger.mergeDocuments(null);
        return outputFile.toAbsolutePath();
    }

    private void writeForm(GameRow row, Path outputFile) throws IOException {
        try (PDDocument document = Loader.loadPDF(readTemplate(TEMPLATE_RESOURCE))) {
            PDAcroForm form = document.getDocumentCatalog().getAcroForm();
            if (form == null) {
                throw new IOException("Die PDF-Vorlage enthält kein Formular.");
            }

            setField(form, "Nr", row.number());
            setField(form, "Datum", row.date());
            setField(form, "Feld Nr", row.court());
            setField(form, "Schiri", row.referee());

            String[] teamAPlayers = splitTeam(row.teamA());
            setField(form, "Team A Spieler 1", teamAPlayers[0]);
            setField(form, "Team A Spieler 2", teamAPlayers[1]);

            String[] teamBPlayers = splitTeam(row.teamB());
            setField(form, "Team B Spieler 1", teamBPlayers[0]);
            setField(form, "Team B Spieler 2", teamBPlayers[1]);

            refreshAppearances(form);
            form.flatten();
            document.save(outputFile.toFile());
        }
    }

    private void writeEasyForm(GameRow firstRow, GameRow secondRow, Path outputFile) throws IOException {
        try (PDDocument document = Loader.loadPDF(readTemplate(EASY_TEMPLATE_RESOURCE))) {
            PDAcroForm form = document.getDocumentCatalog().getAcroForm();
            if (form == null) {
                throw new IOException("Die Easy-PDF-Vorlage enthält kein Formular.");
            }

            fillPrefixedFields(form, "F1_", firstRow);
            if (secondRow != null) {
                fillPrefixedFields(form, "F2_", secondRow);
            }
            refreshAppearances(form);
            form.flatten();
            document.save(outputFile.toFile());
        }
    }

    private void fillPrefixedFields(PDAcroForm form, String prefix, GameRow row) throws IOException {
        setField(form, prefix + "Nr", row.number());
        setField(form, prefix + "Datum", row.date());
        setField(form, prefix + "Feld Nr", row.court());
        setField(form, prefix + "Schiri", row.referee());

        String[] teamAPlayers = splitTeam(row.teamA());
        setField(form, prefix + "Team A Spieler 1", teamAPlayers[0]);
        setField(form, prefix + "Team A Spieler 2", teamAPlayers[1]);

        String[] teamBPlayers = splitTeam(row.teamB());
        setField(form, prefix + "Team B Spieler 1", teamBPlayers[0]);
        setField(form, prefix + "Team B Spieler 2", teamBPlayers[1]);
    }

    private byte[] readTemplate(String resource) throws IOException {
        try (InputStream inputStream = PdfFormWriter.class.getResourceAsStream(resource)) {
            if (inputStream == null) {
                throw new IOException("PDF-Vorlage wurde nicht gefunden: " + resource);
            }
            return inputStream.readAllBytes();
        }
    }

    private void setField(PDAcroForm form, String fieldName, String value) throws IOException {
        PDField field = form.getField(fieldName);
        if (field == null) {
            throw new IOException("Formularfeld wurde nicht gefunden: " + fieldName);
        }
        field.setValue(value == null ? "" : value);
    }

    private void refreshAppearances(PDAcroForm form) throws IOException {
        if (form.getDefaultAppearance() == null || form.getDefaultAppearance().isBlank()) {
            form.setDefaultAppearance("/Helv 10 Tf 0 g");
        }
        form.setNeedAppearances(false);
        form.refreshAppearances();
    }

    private String[] splitTeam(String team) {
        String cleanedTeam = stripSeed(team);
        String[] players = cleanedTeam.split("\\s+-\\s+", 2);
        if (players.length == 1) {
            return new String[]{players[0], ""};
        }
        return new String[]{players[0], players[1]};
    }

    private String stripSeed(String value) {
        return value == null ? "" : value.replaceAll("\\s*\\([^)]*\\)\\s*$", "").trim();
    }

    private Path outputPathFor(Path outputDirectory, GameRow row, int index) {
        String suffix = row.number().isBlank() ? String.valueOf(index + 1) : sanitize(row.number());
        return outputDirectory.resolve("SpielNr_" + suffix + ".pdf");
    }

    private String sanitize(String value) {
        String sanitized = value.replaceAll("[^A-Za-z0-9._-]+", "_");
        return sanitized.isBlank() ? "Spiel" : sanitized;
    }
}
