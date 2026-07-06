package org.example;

import java.util.ArrayList;
import java.util.List;

public class PageSection {
    private final String heading;
    private final List<String> paragraphs = new ArrayList<>();

    public PageSection(String heading) {
        this.heading = heading == null || heading.isBlank() ? "Ohne Ueberschrift" : heading.trim();
    }

    public String heading() {
        return heading;
    }

    public List<String> paragraphs() {
        return List.copyOf(paragraphs);
    }

    public void addParagraph(String paragraph) {
        if (paragraph != null && !paragraph.isBlank()) {
            paragraphs.add(paragraph.trim());
        }
    }

    public boolean hasContent() {
        return !paragraphs.isEmpty();
    }
}
