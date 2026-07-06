package org.example;

public class GameEditUpdate {
    private final String editUrl;
    private final String editMethod;
    private final String editData;
    private final String court;
    private final String gameRating;
    private final String set1TeamA;
    private final String set1TeamB;
    private final String set2TeamA;
    private final String set2TeamB;
    private final String set3TeamA;
    private final String set3TeamB;

    public GameEditUpdate(
            String editUrl,
            String editMethod,
            String editData,
            String court,
            String gameRating,
            String set1TeamA,
            String set1TeamB,
            String set2TeamA,
            String set2TeamB,
            String set3TeamA,
            String set3TeamB) {
        this.editUrl = valueOrEmpty(editUrl);
        this.editMethod = valueOrEmpty(editMethod).isBlank() ? "GET" : valueOrEmpty(editMethod).toUpperCase();
        this.editData = valueOrEmpty(editData);
        this.court = valueOrEmpty(court);
        this.gameRating = valueOrEmpty(gameRating);
        this.set1TeamA = valueOrEmpty(set1TeamA);
        this.set1TeamB = valueOrEmpty(set1TeamB);
        this.set2TeamA = valueOrEmpty(set2TeamA);
        this.set2TeamB = valueOrEmpty(set2TeamB);
        this.set3TeamA = valueOrEmpty(set3TeamA);
        this.set3TeamB = valueOrEmpty(set3TeamB);
    }

    public String editUrl() {
        return editUrl;
    }

    public String editMethod() {
        return editMethod;
    }

    public String editData() {
        return editData;
    }

    public String court() {
        return court;
    }

    public String gameRating() {
        return gameRating;
    }

    public String set1TeamA() {
        return set1TeamA;
    }

    public String set1TeamB() {
        return set1TeamB;
    }

    public String set2TeamA() {
        return set2TeamA;
    }

    public String set2TeamB() {
        return set2TeamB;
    }

    public String set3TeamA() {
        return set3TeamA;
    }

    public String set3TeamB() {
        return set3TeamB;
    }

    private static String valueOrEmpty(String value) {
        return value == null ? "" : value.trim();
    }
}
