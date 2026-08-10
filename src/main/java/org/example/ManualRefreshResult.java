package org.example;

import java.nio.file.Path;

final class ManualRefreshResult {
    private final WebPageScraper.ScrapeResult scrapeResult;
    private final Path displayFile;

    ManualRefreshResult(WebPageScraper.ScrapeResult scrapeResult, Path displayFile) {
        this.scrapeResult = scrapeResult;
        this.displayFile = displayFile;
    }

    WebPageScraper.ScrapeResult scrapeResult() {
        return scrapeResult;
    }

    Path displayFile() {
        return displayFile;
    }
}
