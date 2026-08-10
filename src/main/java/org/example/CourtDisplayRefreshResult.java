package org.example;

import java.nio.file.Path;
import java.util.List;

final class CourtDisplayRefreshResult {
    private final Path displayFile;
    private final List<RowSelection> rows;
    private final WebPageScraper.LoginStatus loginStatus;

    CourtDisplayRefreshResult(Path displayFile, List<RowSelection> rows, WebPageScraper.LoginStatus loginStatus) {
        this.displayFile = displayFile;
        this.rows = rows;
        this.loginStatus = loginStatus;
    }

    Path displayFile() {
        return displayFile;
    }

    List<RowSelection> rows() {
        return rows;
    }

    WebPageScraper.LoginStatus loginStatus() {
        return loginStatus;
    }
}
