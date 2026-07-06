package org.example;

public class GameRow {
    private final String number;
    private final String date;
    private final String court;
    private final String teamA;
    private final String teamB;
    private final String referee;
    private final String result;
    private final int winnerTeam;
    private final String editUrl;
    private final String editMethod;
    private final String editData;
    private final String gameRating;
    private final String set1TeamA;
    private final String set1TeamB;
    private final String set2TeamA;
    private final String set2TeamB;
    private final String set3TeamA;
    private final String set3TeamB;

    public GameRow(String number, String date, String court, String teamA, String teamB, String referee) {
        this(number, date, court, teamA, teamB, referee, "");
    }

    public GameRow(String number, String date, String court, String teamA, String teamB, String referee, String result) {
        this(number, date, court, teamA, teamB, referee, result, 0);
    }

    public GameRow(String number, String date, String court, String teamA, String teamB, String referee, String result, int winnerTeam) {
        this(number, date, court, teamA, teamB, referee, result, winnerTeam, "", "GET", "", "", "", "", "", "", "", "");
    }

    public GameRow(
            String number,
            String date,
            String court,
            String teamA,
            String teamB,
            String referee,
            String result,
            int winnerTeam,
            String editUrl,
            String editMethod,
            String editData,
            String gameRating,
            String set1TeamA,
            String set1TeamB,
            String set2TeamA,
            String set2TeamB,
            String set3TeamA,
            String set3TeamB) {
        this.number = valueOrEmpty(number);
        this.date = valueOrEmpty(date);
        this.court = valueOrEmpty(court);
        this.teamA = valueOrEmpty(teamA);
        this.teamB = valueOrEmpty(teamB);
        this.referee = valueOrEmpty(referee);
        this.result = valueOrEmpty(result);
        this.winnerTeam = winnerTeam == 1 || winnerTeam == 2 ? winnerTeam : 0;
        this.editUrl = valueOrEmpty(editUrl);
        this.editMethod = valueOrEmpty(editMethod).isBlank() ? "GET" : valueOrEmpty(editMethod).toUpperCase();
        this.editData = valueOrEmpty(editData);
        this.gameRating = valueOrEmpty(gameRating);
        this.set1TeamA = valueOrEmpty(set1TeamA);
        this.set1TeamB = valueOrEmpty(set1TeamB);
        this.set2TeamA = valueOrEmpty(set2TeamA);
        this.set2TeamB = valueOrEmpty(set2TeamB);
        this.set3TeamA = valueOrEmpty(set3TeamA);
        this.set3TeamB = valueOrEmpty(set3TeamB);
    }

    public String number() {
        return number;
    }

    public String date() {
        return date;
    }

    public String court() {
        return court;
    }

    public String teamA() {
        return teamA;
    }

    public String teamB() {
        return teamB;
    }

    public String referee() {
        return referee;
    }

    public String result() {
        return result;
    }

    public boolean isCompleted() {
        return !result.isBlank() || winnerTeam > 0;
    }

    public int winnerTeam() {
        return winnerTeam;
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

    public String toParagraph() {
        return "Nr: " + number
                + " | Datum: " + date
                + " | Court: " + court
                + " | Team A: " + teamA
                + " | Team B: " + teamB
                + " | Schiri: " + referee
                + " | Ergebnis: " + result
                + " | Sieger: " + winnerTeam
                + " | Edit URL: " + editUrl
                + " | Edit Method: " + editMethod
                + " | Edit Data: " + editData
                + " | Spielwertung: " + gameRating
                + " | Satz 1 Team A: " + set1TeamA
                + " | Satz 1 Team B: " + set1TeamB
                + " | Satz 2 Team A: " + set2TeamA
                + " | Satz 2 Team B: " + set2TeamB
                + " | Satz 3 Team A: " + set3TeamA
                + " | Satz 3 Team B: " + set3TeamB;
    }

    public static GameRow fromParagraph(String paragraph) {
        String number = "";
        String date = "";
        String court = "";
        String teamA = "";
        String teamB = "";
        String referee = "";
        String result = "";
        int winnerTeam = 0;
        String editUrl = "";
        String editMethod = "GET";
        String editData = "";
        String gameRating = "";
        String set1TeamA = "";
        String set1TeamB = "";
        String set2TeamA = "";
        String set2TeamB = "";
        String set3TeamA = "";
        String set3TeamB = "";

        for (String part : paragraph.split("\\|")) {
            String[] field = part.trim().split(":", 2);
            if (field.length != 2) {
                continue;
            }

            String label = field[0].trim();
            String value = field[1].trim();
            if ("Nr".equals(label)) {
                number = value;
            } else if ("Datum".equals(label) || "Tag".equals(label)) {
                date = value;
            } else if ("Court".equals(label)) {
                court = value;
            } else if ("Team A".equals(label)) {
                teamA = value;
            } else if ("Team B".equals(label)) {
                teamB = value;
            } else if ("Schiri".equals(label)) {
                referee = value;
            } else if ("Ergebnis".equals(label)) {
                result = value;
            } else if ("Sieger".equals(label)) {
                winnerTeam = parseWinnerTeam(value);
            } else if ("Edit URL".equals(label)) {
                editUrl = value;
            } else if ("Edit Method".equals(label)) {
                editMethod = value;
            } else if ("Edit Data".equals(label)) {
                editData = value;
            } else if ("Spielwertung".equals(label)) {
                gameRating = value;
            } else if ("Satz 1 Team A".equals(label)) {
                set1TeamA = value;
            } else if ("Satz 1 Team B".equals(label)) {
                set1TeamB = value;
            } else if ("Satz 2 Team A".equals(label)) {
                set2TeamA = value;
            } else if ("Satz 2 Team B".equals(label)) {
                set2TeamB = value;
            } else if ("Satz 3 Team A".equals(label)) {
                set3TeamA = value;
            } else if ("Satz 3 Team B".equals(label)) {
                set3TeamB = value;
            }
        }

        return new GameRow(number, date, court, teamA, teamB, referee, result, winnerTeam,
                editUrl, editMethod, editData, gameRating, set1TeamA, set1TeamB, set2TeamA, set2TeamB, set3TeamA, set3TeamB);
    }

    private static int parseWinnerTeam(String value) {
        try {
            int parsed = Integer.parseInt(value.trim());
            return parsed == 1 || parsed == 2 ? parsed : 0;
        } catch (Exception exception) {
            return 0;
        }
    }

    private static String valueOrEmpty(String value) {
        return value == null ? "" : value.trim();
    }
}
