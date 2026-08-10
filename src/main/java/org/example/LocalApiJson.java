package org.example;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.List;

final class LocalApiJson {
    private LocalApiJson() {
    }

    static String queryParam(String rawQuery, String name) {
        if (rawQuery == null || rawQuery.isBlank()) {
            return "";
        }
        for (String part : rawQuery.split("&")) {
            String[] field = part.split("=", 2);
            if (field.length == 2 && name.equals(URLDecoder.decode(field[0], StandardCharsets.UTF_8))) {
                return URLDecoder.decode(field[1], StandardCharsets.UTF_8);
            }
        }
        return "";
    }

    static String jsonField(String json, String name) {
        String marker = "\"" + name + "\"";
        int keyIndex = json.indexOf(marker);
        if (keyIndex < 0) {
            return "";
        }
        int colonIndex = json.indexOf(':', keyIndex + marker.length());
        if (colonIndex < 0) {
            return "";
        }
        int cursor = colonIndex + 1;
        while (cursor < json.length() && Character.isWhitespace(json.charAt(cursor))) {
            cursor++;
        }
        if (json.startsWith("true", cursor)) {
            return "true";
        }
        if (json.startsWith("false", cursor)) {
            return "false";
        }
        if (cursor >= json.length() || json.charAt(cursor) != '"') {
            return "";
        }

        StringBuilder value = new StringBuilder();
        boolean escaping = false;
        for (int index = cursor + 1; index < json.length(); index++) {
            char character = json.charAt(index);
            if (escaping) {
                value.append(character);
                escaping = false;
            } else if (character == '\\') {
                escaping = true;
            } else if (character == '"') {
                return value.toString();
            } else {
                value.append(character);
            }
        }
        return "";
    }

    static String jsonArray(List<String> values) {
        StringBuilder builder = new StringBuilder("[");
        for (int index = 0; index < values.size(); index++) {
            if (index > 0) {
                builder.append(',');
            }
            builder.append(jsonString(values.get(index)));
        }
        return builder.append(']').toString();
    }

    static String jsonInteger(int value) {
        return value > 0 ? String.valueOf(value) : "null";
    }

    static String jsonString(String value) {
        if (value == null) {
            return "null";
        }
        StringBuilder builder = new StringBuilder("\"");
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            if (character == '"' || character == '\\') {
                builder.append('\\').append(character);
            } else if (character == '\n') {
                builder.append("\\n");
            } else if (character == '\r') {
                builder.append("\\r");
            } else if (character == '\t') {
                builder.append("\\t");
            } else if (character < 0x20) {
                builder.append(String.format("\\u%04x", (int) character));
            } else {
                builder.append(character);
            }
        }
        return builder.append('"').toString();
    }
}
