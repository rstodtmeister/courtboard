# Lasttest der öffentlichen Courts-Übersicht

Getesteter Frontend-Stand: `ce20c13` (10. September 2026).

## Aufbau

Öffentliche Supabase-Leseabfragen des produktiven Backends, mit dem öffentlichen
Frontend-Schlüssel. Keine Admin-Abfragen, Ergebnisänderungen oder HVV-Aufrufe.
Ein Node.js-Prozess simuliert voneinander unabhängige Zuschauer: je Durchlauf
Spiele abrufen, anschließend fünf Sekunden warten; Turnierdaten je Zuschauer
höchstens einmal pro Minute abrufen. Die Zuschauer einer Stufe starten innerhalb
einer Sekunde. Die Stufen laufen nacheinander: 1 Zuschauer für 15 Sekunden,
10 und 25 Zuschauer jeweils 30 Sekunden, 50 Zuschauer für 120 Sekunden.
Bei zehn Fehlern stoppt der Test neue Abfragen; einzelne Anfragen haben ein
Timeout von zehn Sekunden.

Gemessen wird die Zeit bis zum vollständig empfangenen und geparsten JSON.
Datenmengen beziehen sich auf das dekomprimierte JSON, nicht auf abgerechneten
Supabase-Traffic oder die tatsächlich komprimierte Netzwerkübertragung.

## Ergebnisse

Messung abgeschlossen: 2026-09-10T13:39:59.051Z (UTC).

| Zuschauer | Dauer | Anfragen | Fehler | Median | 95. Perzentil | Maximum | JSON-Daten |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 15 s | 4 | 0 | 68 ms | 212 ms | 212 ms | 0.03 MB |
| 10 | 30 s | 71 | 0 | 75 ms | 168 ms | 196 ms | 0.51 MB |
| 25 | 30 s | 175 | 0 | 65 ms | 230 ms | 465 ms | 1.26 MB |
| 50 | 120 s | 1300 | 0 | 124 ms | 183 ms | 1651 ms | 10.06 MB |

In der 50-Zuschauer-Stufe: 1.200 erfolgreiche Aktualisierungsdurchläufe,
10,83 Anfragen pro Sekunde im Mittel. 95 % der vollständigen Durchläufe lagen
unter 203 ms. Insgesamt einschließlich Vorabfragen: 1.552 Anfragen, keine Fehler.

Die getestete Übersicht bewältigt diese kurze Zuschauerlast ohne erkennbare
Fehler oder anhaltende starke Verzögerungen. Das ist keine Kapazitätsgarantie
für den vollständigen Turnierbetrieb; die unten genannten Grenzen bleiben bestehen.

## Grenzen

Das standardmäßig angezeigte Turnier enthält 18 offene Spiele. Zum Testzeitpunkt
ist kein Schiedsgericht angemeldet; daher fordert die Übersicht keine
Punkteverläufe an. Ein Turnier mit mehr Spielen, längeren Punkteverläufen und vier
parallel speichernden Schiedsrichtern ist durch diesen Test nicht abgedeckt.
Auch Browserdarstellung, Mobilfunkverbindungen, eingebettete Livestreams und
statische Website-Dateien werden nicht belastet. Alle HTTP-Clients laufen auf
einem Rechner mit gemeinsamem Verbindungspool; dies ist kein Test mit 50 echten
Browsern auf unterschiedlichen Geräten.

## Wiederholen

Mit Node.js und den öffentlichen Projektwerten in `SUPABASE_URL` und
`SUPABASE_ANON_KEY`:

```sh
node scripts/load-test-displays.mjs
```

Optional wählt `TOURNAMENT_ID` ein bestimmtes Turnier. `LOAD_TEST_REPORT` setzt
den Pfad der JSON-Messdaten; Standard ist
`/private/tmp/courtboard-display-load-test.json`. Das Skript verändert keine
Spieldaten. Ein erneuter Lauf erzeugt bewusst zusätzliche Last auf dem angegebenen
Backend und sollte zeitlich abgestimmt erfolgen.
