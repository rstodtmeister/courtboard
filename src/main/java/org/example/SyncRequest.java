package org.example;

final class SyncRequest {
    private final String url;
    private final String username;
    private final String password;
    private final boolean ignoreResults;

    private SyncRequest(String url, String username, String password, boolean ignoreResults) {
        this.url = url;
        this.username = username;
        this.password = password;
        this.ignoreResults = ignoreResults;
    }

    String url() {
        return url;
    }

    String username() {
        return username;
    }

    String password() {
        return password;
    }

    boolean ignoreResults() {
        return ignoreResults;
    }

    static SyncRequest fromJson(String json) {
        return new SyncRequest(
                LocalApiJson.jsonField(json, "url"),
                LocalApiJson.jsonField(json, "username"),
                LocalApiJson.jsonField(json, "password"),
                "true".equals(LocalApiJson.jsonField(json, "ignoreResults")));
    }
}
