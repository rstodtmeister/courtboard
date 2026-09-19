---
title: Testnachweise
updated: 2026-09-19
status: historical-report
source_commit: 0fa17d309b986079df46f12883f9996d7c3af467
---

# Testnachweise

## Historische Nachweise

| Datum | Umfang | Umgebung | Ergebnis laut Quelle | Commit |
| --- | --- | --- | --- | --- |
| 11.09.2026 | Zuverlässige Erfassung | Node, PGlite, Mock-Chromium, isolierte gehostete Lastfixture | Prüfungen bestanden; Lastlauf ohne Speicherfehler | Im Bericht nicht eindeutig angegeben |
| 11.09.2026 | Spielprotokolle | Node, PGlite, Mock-Chromium, isolierte gehostete Fixture | Prüfungen bestanden; keine doppelten Abschlussereignisse | Im Bericht nicht eindeutig angegeben |

Das sind Aussagen der vorhandenen Berichte, keine in dieser Wiki-Einrichtung wiederholten Läufe.
Metadatum `source_commit` dokumentiert nur den Repository-Stand, an dem die Berichte gelesen wurden.

## Weitere historische Berichte

| Datum | Bericht | Einordnung und Grenzen |
| --- | --- | --- |
| 10.09.2026 | [Öffentliche Anzeige](../../../docs/reports/display-load-test-2026-09-10.md) | Öffentliche HTTP-Leseabfragen, Frontendstand `ce20c13`; kein Rendering oder Schreibtest |
| 10.09.2026 | [Kombinierte Last](../../../docs/reports/combined-load-test-2026-09-10.md) | 18 synthetische Spiele, 50 Leser/vier Schreiber; kein Abschluss/HVV, kurze Messung |
| 10.09.2026 | [Kompakte Anzeige/Queue](../../../docs/reports/public-performance-2026-09-10.md) | Erfolgreicher zweiter Lauf mit 120 Spielen; erster Versuch mit einem ungeklärten 15-s-Timeout abgebrochen. Keine reale HVV-Zustellung |
| 11.09.2026 | [Neustartvergleich](../../../docs/reports/supabase-restart-2026-09-11.md) | Einzelnes Vorher-/Nachher-Paar bei `f90d12b37cc38730314e8e24bf91d6749bf6da48`; begründet keine regelmäßigen Neustarts |

JSON-Rohmessungen liegen jeweils neben den Markdown-Berichten. HTTP-Last von einem Rechner
ist kein Browser-, Mobilfunk- oder Livestreamtest; dekomprimiertes JSON ist keine Egressmessung.
Die datierten gehosteten Fixtures in den Quellen belegen ausschließlich damalige Umgebungen.

## Aktuelle Wiki-Prüfung (17.09.2026)

Quellenstand `0fa17d309b986079df46f12883f9996d7c3af467`, lokale Wissensdateien noch
unversioniert. Für diesen Dokumentationsabgleich wird ausschließlich
`python3 scripts/check-knowledge.py` lokal ausgeführt; Ergebnis im [Log](../log.md).
Keine Anwendungstests und keine Live-Prüfung durchgeführt. Neuere Tests etwa für
Companion, HVV-Import, Replays und Konfliktabgleich sind vorhanden, hier nicht bestanden erklärt.

## Lokaler Frontend-Lauf (19.09.2026)

Für die getrennten Livestream-Aktionen unter Courts wurde `npm --prefix web-admin run check`
auf HEAD `0fa17d309b986079df46f12883f9996d7c3af467` mit lokalen Änderungen ausgeführt.
Die Node-Tests einschließlich des neuen Court-Stream-Zustandstests sowie TypeScript-Prüfung
und Produktionsbuild waren erfolgreich. Da der zusammenhängende Lauf nach der Ausgabe der
Referee-Tests an die Werkzeug-Zeitgrenze kam, wurden die noch nicht ausgegebenen Schritte
`npm --prefix web-admin run test:companion` und `npm --prefix web-admin run build` separat
erfolgreich abgeschlossen. Dieser Check selbst umfasst keine Browser-Interaktion.

Anschließend wurde `node scripts/test-court-stream-browser.mjs` gegen einen lokalen
Vite-Devserver ausgeführt. Playwright steuerte den installierten Google Chrome headless bei
390 × 844 Pixeln. Der Lauf bestätigte Ausgangszustand, Linkeingabe, Speichern, unveränderten
Zustand, Linkänderung, Entfernen, geleertes Feld und fehlenden horizontalen Überlauf.
`playwright-core` wurde dafür nur im ignorierten `node_modules` installiert; Manifest und
Lockfile blieben unverändert. Keine Netzwerk-, Backend- oder Live-YouTube-Interaktion.

## Mobile Einrichtung des Aufzeichnungsbeginns (19.09.2026)

Auf HEAD `4351b5717318ff4231d202aacbb15de3b5daa85b` mit lokalen Änderungen steuerte
`scripts/test-youtube-settings-browser.mjs` Google Chrome headless bei 390 × 844 Pixeln.
Der Test bestätigte Speichern der aktuellen Gerätezeit mit einem Tipp, kompakten Status,
manuelle Bearbeitung, nur bei mehreren Videos sichtbare Auswahl, Feineinstellung mit
Fünf-Sekunden-Schritt und fehlenden horizontalen Überlauf. Supabase-Antworten waren
vollständig simuliert; kein Live-YouTube- oder Datenbankzugriff. Zusätzlich erfolgreich:
`npm --prefix web-admin run test:companion` und `npm --prefix web-admin run build`.

## Teamfotos im Stream-Overlay (19.09.2026)

Auf HEAD `1c3170d01e9197e0fdf965d057639073c5096c10` mit lokalen Änderungen waren
`npm --prefix web-admin run test:display`, `npm --prefix web-admin run typecheck`,
`npm --prefix web-admin run build` und `git diff --check` erfolgreich. Der ergänzte
Anzeige-Test prüft die gespiegelten Rasterbereiche sowie die vorgesehenen großen Bildmaße.

Zusätzlich wurde eine lokale HTML-Vorschau mit synthetischen Teamfotos durch den installierten
Google Chrome headless bei 1920 × 1080 und 800 × 450 Pixeln gerendert und visuell auf
Reihenfolge, Symmetrie und Überlappungen geprüft. Das belegt die CSS-Darstellung der gewählten
Beispiele, aber keinen Lauf mit echten Supabase-Daten, realen Teamfotos oder Streamsoftware.

## Neuer Nachweis: Vorlage

Für zukünftige Läufe einen Beleg in `knowledge/raw/` oder `docs/reports/` ablegen und hier verlinken:

- Datum und ausführender Agent.
- Commit und gegebenenfalls uncommittete Änderungen.
- Exakter Befehl und Testumfang.
- Umgebung: Mock, PGlite, lokales oder gehostetes Supabase; relevante Versionen.
- Ergebnis: bestanden, fehlgeschlagen, übersprungen oder blockiert.
- Grenzen, Fehler und Cleanup-Ergebnis bei temporären Daten.

Siehe [Teststrategie](strategy.md).

## Quellen

- [Erfassungsbericht](../../../docs/reports/reliable-scoring-2026-09-11.md)
- [Protokollbericht](../../../docs/reports/game-protocols-2026-09-11.md)

## Offene Punkte

Historische Commit-Zuordnung fehlt. Die Anwendungsprüfungen wurden für die Wiki-Einrichtung nicht ausgeführt.
