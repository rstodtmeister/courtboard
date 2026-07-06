package org.example;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

public class PdfReportWriter {
    private static final float MARGIN = 50;
    private static final float LEADING = 16;
    private static final float TITLE_SIZE = 18;
    private static final float HEADING_SIZE = 14;
    private static final float TEXT_SIZE = 11;

    private final PDFont regularFont = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
    private final PDFont boldFont = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);

    public void write(ScrapedPage scrapedPage, Path outputFile) throws IOException {
        Path parent = outputFile.toAbsolutePath().getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }

        try (PDDocument document = new PDDocument()) {
            PdfCursor cursor = new PdfCursor(document);
            cursor.writeLine(scrapedPage.title(), boldFont, TITLE_SIZE, 22);
            cursor.writeLine("Quelle: " + scrapedPage.sourceUrl(), regularFont, TEXT_SIZE, LEADING);
            cursor.writeLine("Ausgelesen am: " + formatTimestamp(scrapedPage), regularFont, TEXT_SIZE, 24);

            for (PageSection section : scrapedPage.sections()) {
                cursor.writeLine(section.heading(), boldFont, HEADING_SIZE, 20);
                for (String paragraph : section.paragraphs()) {
                    cursor.writeParagraph(paragraph, regularFont, TEXT_SIZE);
                }
            }

            cursor.close();
            document.save(outputFile.toFile());
        }
    }

    private String formatTimestamp(ScrapedPage scrapedPage) {
        return DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm:ss z")
                .withZone(ZoneId.systemDefault())
                .format(scrapedPage.scrapedAt());
    }

    private static class PdfCursor {
        private final PDDocument document;
        private PDPage page;
        private PDPageContentStream contentStream;
        private float y;

        private PdfCursor(PDDocument document) throws IOException {
            this.document = document;
            newPage();
        }

        private void writeParagraph(String text, PDFont font, float fontSize) throws IOException {
            for (String line : wrap(text, font, fontSize, availableWidth())) {
                writeLine(line, font, fontSize, LEADING);
            }
            y -= 6;
        }

        private void writeLine(String text, PDFont font, float fontSize, float lineHeight) throws IOException {
            ensureSpace(lineHeight);
            contentStream.beginText();
            contentStream.setFont(font, fontSize);
            contentStream.newLineAtOffset(MARGIN, y);
            contentStream.showText(stripUnsupportedCharacters(text));
            contentStream.endText();
            y -= lineHeight;
        }

        private void ensureSpace(float requiredHeight) throws IOException {
            if (y - requiredHeight < MARGIN) {
                newPage();
            }
        }

        private void newPage() throws IOException {
            if (contentStream != null) {
                contentStream.close();
            }

            page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            contentStream = new PDPageContentStream(document, page);
            y = page.getMediaBox().getHeight() - MARGIN;
        }

        private float availableWidth() {
            return page.getMediaBox().getWidth() - (2 * MARGIN);
        }

        private void close() throws IOException {
            if (contentStream != null) {
                contentStream.close();
            }
        }

        private static List<String> wrap(String text, PDFont font, float fontSize, float maxWidth) throws IOException {
            List<String> lines = new ArrayList<>();
            StringBuilder currentLine = new StringBuilder();

            for (String word : stripUnsupportedCharacters(text).split("\\s+")) {
                String candidate = currentLine.length() == 0 ? word : currentLine + " " + word;
                if (width(candidate, font, fontSize) <= maxWidth) {
                    currentLine.setLength(0);
                    currentLine.append(candidate);
                } else {
                    if (currentLine.length() > 0) {
                        lines.add(currentLine.toString());
                    }
                    currentLine.setLength(0);
                    currentLine.append(word);
                }
            }

            if (currentLine.length() > 0) {
                lines.add(currentLine.toString());
            }

            return lines;
        }

        private static float width(String text, PDFont font, float fontSize) throws IOException {
            return font.getStringWidth(text) / 1000 * fontSize;
        }

        private static String stripUnsupportedCharacters(String text) {
            return text == null ? "" : text.replaceAll("[^\\x09\\x0A\\x0D\\x20-\\x7E\\u00A0-\\u00FF]", "");
        }
    }
}
