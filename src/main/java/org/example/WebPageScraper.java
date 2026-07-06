package org.example;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;

import java.io.IOException;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class WebPageScraper {
    private final Map<String, Session> sessions = new HashMap<>();

    public ScrapedPage scrape(String source) throws IOException {
        return scrape(source, "", "");
    }

    public ScrapedPage scrape(String source, String username, String password) throws IOException {
        return scrapeWithStatus(source, username, password).page();
    }

    public ScrapeResult scrapeWithStatus(String source, String username, String password) throws IOException {
        LoadResult loadResult = loadDocument(source, username, password);
        Document document = loadResult.document();

        document.select("script, style, noscript, svg").remove();

        List<PageSection> sections = extractBeachGameSections(document);
        if (sections.isEmpty()) {
            sections = extractSections(document);
        }
        if (sections.isEmpty()) {
            sections = List.of(sectionFromBodyText(document));
        }

        String title = document.title().isBlank() ? source : document.title();
        return new ScrapeResult(new ScrapedPage(source, title, Instant.now(), sections), loadResult.loginStatus());
    }

    public void submitGameUpdate(GameEditUpdate update, String username, String password) throws IOException {
        if (update.editUrl().isBlank()) {
            throw new IOException("Für das Spiel wurde kein Bearbeiten-Link gefunden.");
        }
        if (!update.editUrl().startsWith("http://") && !update.editUrl().startsWith("https://")) {
            throw new IOException("Bearbeiten-Link ist keine Web-URL: " + update.editUrl());
        }

        LoadedEditPage editPage = loadGameEditPage(update, username, password);
        Element form = gameEditForm(editPage.document());
        if (form == null) {
            throw new IOException("Auf der Bearbeiten-Seite wurde kein Spiel-Formular gefunden.");
        }

        Map<String, String> formData = formData(form);
        int changedFields = 0;
        changedFields += replaceFormValue(form, formData, update.court(), List.of("court", "feld", "platz"));
        changedFields += replaceFormValue(form, formData, update.gameRating(), List.of("wertungid", "spielwertung", "wertung"));
        changedFields += replaceFormValue(form, formData, update.set1TeamA(), List.of("s1pa", "satz1teama", "satz1a", "set1teama", "set1a"));
        changedFields += replaceFormValue(form, formData, update.set1TeamB(), List.of("s1pb", "satz1teamb", "satz1b", "set1teamb", "set1b"));
        changedFields += replaceFormValue(form, formData, update.set2TeamA(), List.of("s2pa", "satz2teama", "satz2a", "set2teama", "set2a"));
        changedFields += replaceFormValue(form, formData, update.set2TeamB(), List.of("s2pb", "satz2teamb", "satz2b", "set2teamb", "set2b"));
        changedFields += replaceFormValue(form, formData, update.set3TeamA(), List.of("s3pa", "satz3teama", "satz3a", "set3teama", "set3a"));
        changedFields += replaceFormValue(form, formData, update.set3TeamB(), List.of("s3pb", "satz3teamb", "satz3b", "set3teamb", "set3b"));

        if (changedFields == 0) {
            throw new IOException("Keine passenden Formularfelder für die Schnellbearbeitung gefunden.");
        }

        addSubmitButtonValue(form, formData);
        String actionUrl = form.absUrl("action");
        if (actionUrl.isBlank()) {
            actionUrl = editPage.document().location().isBlank() ? update.editUrl() : editPage.document().location();
        }
        org.jsoup.Connection.Method method = "get".equalsIgnoreCase(form.attr("method"))
                ? org.jsoup.Connection.Method.GET
                : org.jsoup.Connection.Method.POST;

        org.jsoup.Connection.Response saveResponse = baseConnection(actionUrl, username, password)
                .method(method)
                .cookies(editPage.cookies())
                .data(formData)
                .followRedirects(true)
                .execute();
        editPage.cookies().putAll(saveResponse.cookies());
        editPage.session().replaceCookies(editPage.cookies());
    }

    public GameEditUpdate loadGameEditValues(GameEditUpdate request, String username, String password) throws IOException {
        LoadedEditPage editPage = loadGameEditPage(request, username, password);
        Element form = gameEditForm(editPage.document());
        if (form == null) {
            throw new IOException("Auf der Bearbeiten-Seite wurde kein Spiel-Formular gefunden.");
        }

        return new GameEditUpdate(
                request.editUrl(),
                request.editMethod(),
                request.editData(),
                fieldValue(form, "court"),
                fieldValue(form, "wertungid"),
                fieldValue(form, "s1pa"),
                fieldValue(form, "s1pb"),
                fieldValue(form, "s2pa"),
                fieldValue(form, "s2pb"),
                fieldValue(form, "s3pa"),
                fieldValue(form, "s3pb"));
    }

    private LoadedEditPage loadGameEditPage(GameEditUpdate request, String username, String password) throws IOException {
        if (request.editUrl().isBlank()) {
            throw new IOException("Für das Spiel wurde kein Bearbeiten-Link gefunden.");
        }
        if (!request.editUrl().startsWith("http://") && !request.editUrl().startsWith("https://")) {
            throw new IOException("Bearbeiten-Link ist keine Web-URL: " + request.editUrl());
        }

        Session session = sessionFor(request.editUrl(), username);
        Map<String, String> cookies = new HashMap<>(session.cookies());
        org.jsoup.Connection.Response editResponse = executeEditRequest(request.editUrl(), request.editMethod(), request.editData(), username, password, cookies);
        cookies.putAll(editResponse.cookies());

        Document document = editResponse.parse();
        if (hasCredentials(username, password) && isLoginPage(document)) {
            submitLoginForm(document, username, password, cookies);
            editResponse = executeEditRequest(request.editUrl(), request.editMethod(), request.editData(), username, password, cookies);
            cookies.putAll(editResponse.cookies());
            document = editResponse.parse();
        }

        session.replaceCookies(cookies);
        return new LoadedEditPage(document, cookies, session);
    }

    private LoadResult loadDocument(String source, String username, String password) throws IOException {
        if (source.startsWith("http://") || source.startsWith("https://")) {
            return loadWebDocument(source, username, password);
        }

        Path file = Path.of(source);
        if (!Files.isRegularFile(file)) {
            throw new IOException("Quelle ist weder URL noch Datei: " + source);
        }
        return new LoadResult(Jsoup.parse(file.toFile(), "UTF-8"), LoginStatus.NOT_REQUIRED);
    }

    private LoadResult loadWebDocument(String source, String username, String password) throws IOException {
        Session session = sessionFor(source, username);
        Map<String, String> cookies = new HashMap<>(session.cookies());
        org.jsoup.Connection.Response firstResponse = baseConnection(source, username, password)
                .cookies(cookies)
                .followRedirects(true)
                .execute();
        cookies.putAll(firstResponse.cookies());

        Document document = firstResponse.parse();
        if (hasCredentials(username, password) && !cookies.isEmpty() && !isLoginPage(document)) {
            session.replaceCookies(cookies);
        }
        if (!hasCredentials(username, password) || !isLoginPage(document)) {
            LoginStatus loginStatus = session.hasCookies() ? LoginStatus.SESSION_REUSED : LoginStatus.NOT_REQUIRED;
            return new LoadResult(document, loginStatus);
        }

        submitLoginForm(document, username, password, cookies);

        org.jsoup.Connection.Response pageResponse = baseConnection(source, username, password)
                .cookies(cookies)
                .followRedirects(true)
                .execute();
        cookies.putAll(pageResponse.cookies());

        Document page = pageResponse.parse();
        if (isLoginPage(page)) {
            throw new IOException("Anmeldung fehlgeschlagen oder Loginformular erneut angezeigt.");
        }

        session.replaceCookies(cookies);
        return new LoadResult(page, LoginStatus.LOGIN_PERFORMED);
    }

    private Session sessionFor(String source, String username) {
        return sessions.computeIfAbsent(sessionKey(source, username), ignored -> new Session());
    }

    private String sessionKey(String source, String username) {
        return source + "|" + (username == null ? "" : username);
    }

    private org.jsoup.Connection baseConnection(String url, String username, String password) {
        org.jsoup.Connection connection = Jsoup.connect(url)
                .userAgent("CourtBoard/1.0")
                .timeout(15_000);

        if (hasCredentials(username, password)) {
            connection.header("Authorization", basicAuthHeader(username, password));
        }

        return connection;
    }

    private boolean isLoginPage(Document document) {
        return document.selectFirst("form#core_login, form[name=core_login]") != null;
    }

    private void submitLoginForm(Document document, String username, String password, Map<String, String> cookies) throws IOException {
        Element form = document.selectFirst("form#core_login, form[name=core_login]");
        if (form == null) {
            throw new IOException("Loginformular wurde nicht gefunden.");
        }

        String loginUrl = form.absUrl("action");
        if (loginUrl.isBlank()) {
            throw new IOException("Loginformular hat keine gültige Ziel-URL.");
        }

        org.jsoup.Connection loginConnection = baseConnection(loginUrl, username, password)
                .method(org.jsoup.Connection.Method.POST)
                .cookies(cookies)
                .followRedirects(true);

        boolean submitButtonAdded = false;
        for (Element input : form.select("input[name]")) {
            String name = input.attr("name");
            String type = input.attr("type");
            if ("username".equals(name)) {
                loginConnection.data(name, username);
            } else if ("password".equals(name)) {
                loginConnection.data(name, password);
            } else if ("submit".equalsIgnoreCase(type)) {
                if (!submitButtonAdded) {
                    loginConnection.data(name, input.attr("value"));
                    submitButtonAdded = true;
                }
            } else {
                loginConnection.data(name, input.attr("value"));
            }
        }

        org.jsoup.Connection.Response loginResponse = loginConnection.execute();
        cookies.putAll(loginResponse.cookies());
    }

    private boolean hasCredentials(String username, String password) {
        return username != null && !username.isBlank() && password != null && !password.isBlank();
    }

    private String basicAuthHeader(String username, String password) {
        String token = username + ":" + password;
        return "Basic " + Base64.getEncoder().encodeToString(token.getBytes(StandardCharsets.UTF_8));
    }

    private List<PageSection> extractBeachGameSections(Document document) {
        List<Element> rows = document.select("tr.beachspielrow");
        if (rows.isEmpty()) {
            return List.of();
        }

        PageSection section = new PageSection("Spielliste");
        for (Element row : rows) {
            String date = textByColumn(row, 1);
            String court = textByDataContent(row, "court", 3);
            String gameNumber = textByColumn(row, 6);
            String teamA = textByDataContent(row, "teamA", 7);
            String teamB = textByDataContent(row, "teamB", 8);
            String result = textByAnyDataContent(row, List.of("ergebnis", "result", "score"), 9);
            String referee = textByDataContent(row, "schiri1", 10);
            int winnerTeam = winnerTeam(row, 7, 8);
            EditRequest editRequest = editRequest(row);
            String[] setScores = setScores(result);

            if (teamA.isBlank() && teamB.isBlank() && referee.isBlank()) {
                continue;
            }

            section.addParagraph(new GameRow(gameNumber, date, court, teamA, teamB, referee, result, winnerTeam,
                    editRequest.url(), editRequest.method(), editRequest.data(), "",
                    setScores[0], setScores[1], setScores[2], setScores[3], setScores[4], setScores[5]).toParagraph());
        }

        if (!section.hasContent()) {
            return List.of();
        }

        return List.of(section);
    }

    private Map<String, String> formData(Element form) {
        Map<String, String> data = new LinkedHashMap<>();
        for (Element input : form.select("input[name]")) {
            String type = input.attr("type").toLowerCase();
            if ("submit".equals(type) || "button".equals(type) || "image".equals(type) || "file".equals(type)) {
                continue;
            }
            if (("checkbox".equals(type) || "radio".equals(type)) && !input.hasAttr("checked")) {
                continue;
            }
            data.put(input.attr("name"), input.attr("value"));
        }
        for (Element textarea : form.select("textarea[name]")) {
            data.put(textarea.attr("name"), textarea.text());
        }
        for (Element select : form.select("select[name]")) {
            Element selected = select.selectFirst("option[selected]");
            if (selected == null) {
                selected = select.selectFirst("option");
            }
            data.put(select.attr("name"), selected == null ? "" : selected.attr("value"));
        }
        return data;
    }

    private Element gameEditForm(Document document) {
        Element form = document.selectFirst("form:has(input[name=spielid])");
        if (form != null) {
            return form;
        }
        form = document.selectFirst("form:has(input[name=court])");
        if (form != null) {
            return form;
        }
        form = document.selectFirst("form:has(select[name=wertungid])");
        if (form != null) {
            return form;
        }
        form = document.selectFirst("form:has(input[name=s1pa]), form:has(input[name=s1pb])");
        if (form != null) {
            return form;
        }
        return null;
    }

    private String fieldValue(Element form, String name) {
        Element field = form.selectFirst("input[name=" + name + "], textarea[name=" + name + "]");
        if (field != null) {
            return "textarea".equalsIgnoreCase(field.tagName()) ? clean(field.text()) : clean(field.attr("value"));
        }

        Element select = form.selectFirst("select[name=" + name + "]");
        if (select == null) {
            return "";
        }
        Element selected = select.selectFirst("option[selected]");
        if (selected == null) {
            selected = select.selectFirst("option");
        }
        return selected == null ? "" : clean(selected.text());
    }

    private org.jsoup.Connection.Response executeEditRequest(
            String editUrl,
            String editMethod,
            String editData,
            String username,
            String password,
            Map<String, String> cookies) throws IOException {
        org.jsoup.Connection.Method method = "POST".equalsIgnoreCase(editMethod)
                ? org.jsoup.Connection.Method.POST
                : org.jsoup.Connection.Method.GET;
        org.jsoup.Connection connection = baseConnection(editUrl, username, password)
                .method(method)
                .cookies(cookies)
                .followRedirects(true);
        Map<String, String> requestData = decodeFormData(editData);
        if (!requestData.isEmpty()) {
            connection.data(requestData);
        }
        return connection.execute();
    }

    private int replaceFormValue(Element form, Map<String, String> formData, String value, List<String> tokens) {
        if (value.isBlank()) {
            return 0;
        }
        Element field = findField(form, tokens);
        if (field == null) {
            return 0;
        }
        formData.put(field.attr("name"), formValue(field, value));
        return 1;
    }

    private String formValue(Element field, String value) {
        if (!"select".equalsIgnoreCase(field.tagName())) {
            return value;
        }
        for (Element option : field.select("option")) {
            if (value.equals(option.attr("value"))) {
                return option.attr("value");
            }
        }
        String normalizedValue = normalizeToken(value);
        for (Element option : field.select("option")) {
            if (normalizedValue.equals(normalizeToken(option.text()))) {
                return option.attr("value");
            }
        }
        return value;
    }

    private Element findField(Element form, List<String> tokens) {
        for (String token : tokens) {
            Element exactField = form.selectFirst("input[name=" + token + "], select[name=" + token + "], textarea[name=" + token + "]");
            if (exactField != null) {
                String type = exactField.attr("type").toLowerCase();
                if (!"hidden".equals(type) && !"submit".equals(type) && !"button".equals(type)) {
                    return exactField;
                }
            }
        }

        Element bestField = null;
        int bestScore = 0;
        for (Element field : form.select("input[name], select[name], textarea[name]")) {
            String type = field.attr("type").toLowerCase();
            if ("hidden".equals(type) || "submit".equals(type) || "button".equals(type)) {
                continue;
            }
            String text = normalizedFieldText(form, field);
            int score = 0;
            for (String token : tokens) {
                if (text.contains(normalizeToken(token))) {
                    score += token.length();
                }
            }
            if (score > bestScore) {
                bestScore = score;
                bestField = field;
            }
        }
        return bestField;
    }

    private String normalizedFieldText(Element form, Element field) {
        String id = field.id();
        StringBuilder text = new StringBuilder()
                .append(field.attr("name")).append(' ')
                .append(id).append(' ')
                .append(field.attr("aria-label")).append(' ')
                .append(field.attr("placeholder")).append(' ')
                .append(field.attr("data-content"));
        if (!id.isBlank()) {
            Element label = form.selectFirst("label[for=" + id + "]");
            if (label != null) {
                text.append(' ').append(label.text());
            }
        }
        Element parent = field.parent();
        if (parent != null) {
            text.append(' ').append(parent.text());
        }
        return normalizeToken(text.toString());
    }

    private String normalizeToken(String value) {
        return value == null ? "" : value.toLowerCase()
                .replace("ä", "ae")
                .replace("ö", "oe")
                .replace("ü", "ue")
                .replace("ß", "ss")
                .replaceAll("[^a-z0-9]+", "");
    }

    private void addSubmitButtonValue(Element form, Map<String, String> formData) {
        Element submit = form.selectFirst("button[type=submit][name], input[type=submit][name]");
        if (submit == null) {
            submit = form.selectFirst("button[name], input[name][type=submit]");
        }
        if (submit != null) {
            formData.put(submit.attr("name"), submit.attr("value"));
        }
    }

    private EditRequest editRequest(Element row) {
        Element form = row.selectFirst("form[action]");
        if (form != null) {
            String actionUrl = form.absUrl("action");
            if (!actionUrl.isBlank()) {
                String method = form.attr("method").isBlank() ? "GET" : form.attr("method").toUpperCase();
                Map<String, String> editFormData = formData(form);
                addSubmitButtonValue(form, editFormData);
                return new EditRequest(actionUrl, method, encodeFormData(editFormData));
            }
        }

        List<Element> links = row.select("a[href]");
        for (Element link : links) {
            String linkText = clean(link.text() + " " + link.attr("title") + " " + link.className() + " " + link.attr("href")).toLowerCase();
            if (linkText.contains("bearbeit") || linkText.contains("edit")) {
                return new EditRequest(link.absUrl("href"), "GET", "");
            }
        }
        return links.size() == 1 ? new EditRequest(links.get(0).absUrl("href"), "GET", "") : new EditRequest("", "GET", "");
    }

    private String encodeFormData(Map<String, String> formData) {
        List<String> parts = new ArrayList<>();
        for (Map.Entry<String, String> entry : formData.entrySet()) {
            parts.add(URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8)
                    + "=" + URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8));
        }
        return String.join("&", parts);
    }

    private Map<String, String> decodeFormData(String encodedData) {
        Map<String, String> data = new LinkedHashMap<>();
        if (encodedData == null || encodedData.isBlank()) {
            return data;
        }
        for (String part : encodedData.split("&")) {
            String[] field = part.split("=", 2);
            if (field.length == 0 || field[0].isBlank()) {
                continue;
            }
            String name = URLDecoder.decode(field[0], StandardCharsets.UTF_8);
            String value = field.length == 2 ? URLDecoder.decode(field[1], StandardCharsets.UTF_8) : "";
            data.put(name, value);
        }
        return data;
    }

    private String[] setScores(String result) {
        String[] scores = {"", "", "", "", "", ""};
        if (result == null || result.isBlank()) {
            return scores;
        }

        java.util.regex.Matcher matcher = java.util.regex.Pattern
                .compile("(\\d{1,2})\\s*[:\\-]\\s*(\\d{1,2})")
                .matcher(result);
        int index = 0;
        while (matcher.find() && index < scores.length) {
            scores[index++] = matcher.group(1);
            scores[index++] = matcher.group(2);
        }
        return scores;
    }

    private String textByDataContent(Element row, String dataContent) {
        Element element = row.selectFirst("[data-content=" + dataContent + "]");
        return element == null ? "" : clean(element.text());
    }

    private int winnerTeam(Element row, int teamAColumnIndex, int teamBColumnIndex) {
        boolean teamAWinner = isWinnerCell(elementByDataContent(row, "teamA", teamAColumnIndex));
        boolean teamBWinner = isWinnerCell(elementByDataContent(row, "teamB", teamBColumnIndex));
        if (teamAWinner == teamBWinner) {
            return 0;
        }
        return teamAWinner ? 1 : 2;
    }

    private Element elementByDataContent(Element row, String dataContent, int fallbackColumnIndex) {
        Element element = row.selectFirst("[data-content=" + dataContent + "]");
        if (element != null) {
            return element;
        }
        List<Element> columns = row.select("td");
        if (fallbackColumnIndex < 0 || fallbackColumnIndex >= columns.size()) {
            return null;
        }
        return columns.get(fallbackColumnIndex);
    }

    private boolean isWinnerCell(Element element) {
        if (element == null) {
            return false;
        }
        if (element.selectFirst("strong, b") != null) {
            return true;
        }
        for (Element styledElement : element.select("[style]")) {
            if (hasBoldFontWeight(styledElement.attr("style"))) {
                return true;
            }
        }
        String classes = element.className().toLowerCase();
        if (classes.contains("winner") || classes.contains("gewinner") || classes.contains("won") || classes.contains("bold")) {
            return true;
        }
        return hasBoldFontWeight(element.attr("style"));
    }

    private boolean hasBoldFontWeight(String style) {
        String styleValue = style == null ? "" : style.toLowerCase();
        String normalizedStyle = styleValue.replaceAll("\\s+", "");
        return normalizedStyle.contains("font-weight:bold")
                || normalizedStyle.contains("font-weight:bolder")
                || normalizedStyle.contains("font-weight:700")
                || normalizedStyle.contains("font-weight:800")
                || normalizedStyle.contains("font-weight:900");
    }

    private String textByAnyDataContent(Element row, List<String> dataContents, int fallbackColumnIndex) {
        for (String dataContent : dataContents) {
            String text = textByDataContent(row, dataContent);
            if (!text.isBlank()) {
                return text;
            }
        }
        return textByColumn(row, fallbackColumnIndex);
    }

    private String textByDataContent(Element row, String dataContent, int fallbackColumnIndex) {
        String text = textByDataContent(row, dataContent);
        return text.isBlank() ? textByColumn(row, fallbackColumnIndex) : text;
    }

    private String textByColumn(Element row, int columnIndex) {
        List<Element> columns = row.select("td");
        if (columnIndex < 0 || columnIndex >= columns.size()) {
            return "";
        }
        return clean(columns.get(columnIndex).text());
    }

    private List<PageSection> extractSections(Document document) {
        List<PageSection> sections = new ArrayList<>();
        PageSection currentSection = null;

        for (Element element : document.body().select("h1, h2, h3, p, li")) {
            String text = clean(element.text());
            if (text.isBlank()) {
                continue;
            }

            if (element.tagName().matches("h[1-3]")) {
                if (currentSection != null && currentSection.hasContent()) {
                    sections.add(currentSection);
                }
                currentSection = new PageSection(text);
            } else {
                if (currentSection == null) {
                    currentSection = new PageSection(document.title());
                }
                currentSection.addParagraph(text);
            }
        }

        if (currentSection != null && currentSection.hasContent()) {
            sections.add(currentSection);
        }

        return sections;
    }

    private PageSection sectionFromBodyText(Document document) {
        PageSection section = new PageSection(document.title());
        section.addParagraph(clean(document.body().text()));
        return section;
    }

    private String clean(String value) {
        return value == null ? "" : value.replaceAll("\\s+", " ").trim();
    }

    public enum LoginStatus {
        LOGIN_PERFORMED,
        SESSION_REUSED,
        NOT_REQUIRED
    }

    public static class ScrapeResult {
        private final ScrapedPage page;
        private final LoginStatus loginStatus;

        private ScrapeResult(ScrapedPage page, LoginStatus loginStatus) {
            this.page = page;
            this.loginStatus = loginStatus;
        }

        public ScrapedPage page() {
            return page;
        }

        public LoginStatus loginStatus() {
            return loginStatus;
        }
    }

    private static class LoadResult {
        private final Document document;
        private final LoginStatus loginStatus;

        private LoadResult(Document document, LoginStatus loginStatus) {
            this.document = document;
            this.loginStatus = loginStatus;
        }

        private Document document() {
            return document;
        }

        private LoginStatus loginStatus() {
            return loginStatus;
        }
    }

    private static class LoadedEditPage {
        private final Document document;
        private final Map<String, String> cookies;
        private final Session session;

        private LoadedEditPage(Document document, Map<String, String> cookies, Session session) {
            this.document = document;
            this.cookies = cookies;
            this.session = session;
        }

        private Document document() {
            return document;
        }

        private Map<String, String> cookies() {
            return cookies;
        }

        private Session session() {
            return session;
        }
    }

    private static class EditRequest {
        private final String url;
        private final String method;
        private final String data;

        private EditRequest(String url, String method, String data) {
            this.url = url == null ? "" : url.trim();
            this.method = method == null || method.isBlank() ? "GET" : method.trim().toUpperCase();
            this.data = data == null ? "" : data.trim();
        }

        private String url() {
            return url;
        }

        private String method() {
            return method;
        }

        private String data() {
            return data;
        }
    }

    private static class Session {
        private final Map<String, String> cookies = new HashMap<>();

        private Map<String, String> cookies() {
            return Map.copyOf(cookies);
        }

        private void replaceCookies(Map<String, String> cookies) {
            this.cookies.clear();
            this.cookies.putAll(cookies);
        }

        private boolean hasCookies() {
            return !cookies.isEmpty();
        }
    }
}
