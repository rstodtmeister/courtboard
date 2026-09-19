---
title: Teststrategie und Abdeckung
updated: 2026-09-17
status: source-reviewed
source_commit: 0fa17d309b986079df46f12883f9996d7c3af467
---

# Teststrategie und Abdeckung

Tests haben eine feste Verantwortung und bilden ein Abschlusskriterium für funktionale Änderungen.
Implementierende Agenten testen ihre Änderungen; ein unabhängiger Test-Agent prüft Integration,
Fehlerfälle und Regressionen. Kleine reine Dokumentationsänderungen benötigen passende
Dokumentationsprüfungen statt eines vollständigen Anwendungsbuilds.

## Vorhandene Prüfungen

| Ebene | Einstieg | Grenze |
| --- | --- | --- |
| Node-Tests, TypeScript, Build | `npm --prefix web-admin run check` | Kein vollständiger Browser-/Datenbanklauf |
| Datenbank | SQL-Dateien unter `supabase/tests/` | Entwicklungsdatenbank und Migrationen erforderlich; Runner vor Ausführung klären |
| Browser | Skripte unter `scripts/test-*-browser.mjs` | Playwright/Chromium und je Skript passende Serverkonfiguration |
| Java-Gerätewechsel | `mvn test-compile`, danach `java -ea -cp target/classes:target/test-classes org.example.ScoreSessionPersistenceTest` | Eigenständiger Assertions-Test; nicht automatisch ein JUnit-Lauf |
| Wiki | `python3 scripts/check-knowledge.py` | Struktur, keine semantische Wahrheitsprüfung |

`npm run check` umfasst inzwischen auch Auth, Anzeige, HVV-Import/Zustellung/Formulare,
Protokolle, Court-QR, Schiedsrichtervorschläge und Team-Begleiter mit Verlauf/Replay.
Vorhandene SQL-Suiten ergänzen Score-Session, YouTube und Funktionsrechte. Die bloße
Existenz dieser Tests ist kein aktueller Erfolgsnachweis; siehe [Nachweise](evidence.md).

Die Browserberichte für Erfassung und Protokolle beschreiben simulierte Supabase-Antworten.
Das belegt Browserverhalten, nicht das Zusammenspiel mit einer echten Datenbank.
Historische SQL-Berichte nutzen PGlite; gehostete Cron-/Netzwerkfunktionen wurden davon getrennt behandelt.

## Prioritäten für funktionale Änderungen

- Erfassung: Reihenfolge, doppelte Requests, Revisionskonflikte und Court-/Gerätesperren.
- Offline: Verbindungsabbruch, Antwortverlust, Neuladen, Wiederaufnahme und Gerätewechsel.
- Rechte: Superadmin/Admin, anonyme Zuschauer, Spiel-/Court-Tokens und private Protokolle.
- Integrationen: HVV-Fehler, Wiederholung, Leases und getrennte Speicher-/Lieferbestätigung.
- Migrationen: bestehende Daten, Trigger, SQL-Funktionen und Rollenberechtigungen.
- Browser: Login, Turnierverwaltung, QR-Link und kompletter Spielabschluss.

Für einen Auftrag Akzeptanzkriterien zuerst festlegen. Relevante Prüfungen erfolgreich
abschließen; verbleibende Blockaden und Lücken ausdrücklich melden. Keine Tests gegen
Live-Spiele starten. Gehostete Prüfungen benötigen einen autorisierten Umfang und isolierte Testdaten.
Siehe [Nachweise](evidence.md) und [Agenten](../agent-roles.md).

## Quellen

- [Nutzerprioritäten](../../raw/2026-09-17-requirements.md)
- [Testbefehle](../../../web-admin/package.json)
- [SQL-Suite für Erfassung](../../../supabase/tests/reliable_score_operations.sql)
- [SQL-Suite für Rechte](../../../supabase/tests/function_privileges.sql)
- [Browser-Erfassung](../../../scripts/test-score-browser.mjs)
- [Browser-Gerätewechsel](../../../scripts/test-score-device-handover.mjs)
- [Java-Test](../../../src/test/java/org/example/ScoreSessionPersistenceTest.java)
- [Historische Testumgebungen](../../../docs/reports/reliable-scoring-2026-09-11.md)

## Offene Punkte

Der Pages-Workflow führt derzeit nur den Build aus; `npm run check`, SQL- und Browserprüfungen
sind dort keine Deployment-Voraussetzung. Ein verbindliches CI-Testgate ist noch umzusetzen.
Ein vollständiger aktueller E2E-Nachweis mit echter Supabase-Instanz ist hier nicht belegt.
