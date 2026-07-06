package org.example;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

public class ScrapedPage {
    private final String sourceUrl;
    private final String title;
    private final Instant scrapedAt;
    private final List<PageSection> sections;

    public ScrapedPage(String sourceUrl, String title, Instant scrapedAt, List<PageSection> sections) {
        this.sourceUrl = Objects.requireNonNull(sourceUrl);
        this.title = Objects.requireNonNull(title);
        this.scrapedAt = Objects.requireNonNull(scrapedAt);
        this.sections = List.copyOf(Objects.requireNonNull(sections));
    }

    public String sourceUrl() {
        return sourceUrl;
    }

    public String title() {
        return title;
    }

    public Instant scrapedAt() {
        return scrapedAt;
    }

    public List<PageSection> sections() {
        return sections;
    }
}
