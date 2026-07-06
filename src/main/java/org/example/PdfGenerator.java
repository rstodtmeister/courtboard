package org.example;

import java.io.IOException;
import java.nio.file.Path;

public class PdfGenerator {
    private final WebPageScraper scraper;
    private final PdfReportWriter writer;

    public PdfGenerator() {
        this(new WebPageScraper(), new PdfReportWriter());
    }

    public PdfGenerator(WebPageScraper scraper, PdfReportWriter writer) {
        this.scraper = scraper;
        this.writer = writer;
    }

    public void generate(String url, Path outputFile) throws IOException {
        ScrapedPage page = scraper.scrape(url);
        writer.write(page, outputFile);
    }

    public void generate(String url, Path outputFile, String username, String password) throws IOException {
        ScrapedPage page = scraper.scrape(url, username, password);
        writer.write(page, outputFile);
    }
}
