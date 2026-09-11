# Supabase-Neustart: Vorher-/Nachher-Vergleich vom 11.09.2026

## Ergebnis

Im einzelnen Vergleich war das Speichern nach dem Neustart etwas schneller und
hatte kleinere Ausreißer. Die öffentlichen Anzeigen wurden nicht durchgehend
schneller: Ihr Median stieg, das 95. Perzentil sank. Aus zwei kurzen Messungen
lässt sich kein dauerhafter Nutzen oder Bedarf für regelmäßige Neustarts ableiten.

| Messung unter gemeinsamer Last | Vorher | Nachher |
|---|---:|---:|
| Speichern: Median | 276 ms | 261 ms |
| Speichern: 95. Perzentil | 422 ms | 345 ms |
| Speichern: Maximum | 2.143 ms | 659 ms |
| Zuschauerabfragen: Median | 124 ms | 160 ms |
| Zuschauerabfragen: 95. Perzentil | 422 ms | 263 ms |
| Zuschauerabfragen: Maximum | 2.195 ms | 1.745 ms |
| Speicherungen | 242 | 241 |
| Zuschauerabfragen | 1.255 | 1.299 |
| Fehler | 0 | 0 |

Alle vier finalen Spielstände und jeweils 120 Historieneinträge waren in beiden
Läufen korrekt. Die unterschiedlichen Anfragezahlen entstehen durch die zeitliche
Begrenzung: Jeder Zuschauer wartet fünf Sekunden nach der vorigen Antwort;
langsamere Antworten führen innerhalb von zwei Minuten zu weniger Durchläufen.

## Gleicher Testaufbau

Unveränderter Anwendungsstand `f90d12b37cc38730314e8e24bf91d6749bf6da48`.
Je Lauf ein separates Testturnier mit 120 synthetischen Spielen, davon vier aktive
und 116 abgeschlossene. Die Spiele starten mit 100 bis 108 Historieneinträgen.
Vier simulierte Schiedsrichter ändern etwa alle zwei Sekunden einen Spielstand;
jede zehnte Änderung nimmt einen Punkt zurück. Übertragen werden wie im Frontend
höchstens die letzten 120 Historieneinträge. Zuschauer laden die kompakte Übersicht.

Vor jedem gemeinsamen Lastabschnitt laufen die vier Schreiber 30 Sekunden allein.
Danach kommen 50 simulierte Zuschauer für 120 Sekunden hinzu. Die erste Phase ist
mit dokumentiert und nicht aus den Daten entfernt:

| Speicherungen ohne Zuschauer, erste 30 Sekunden | Vorher | Nachher |
|---|---:|---:|
| Anzahl | 62 | 61 |
| Median | 286 ms | 274 ms |
| 95. Perzentil | 1.031 ms | 929 ms |
| Maximum | 1.084 ms | 961 ms |
| Fehler | 0 | 0 |

Auch nach dem Neustart waren die ersten Anfragen teilweise langsamer.

## Gemessener Serveranteil

`Server-Timing` während der gemeinsamen Last:

| Abschnitt | Vorher Median / p95 | Nachher Median / p95 |
|---|---:|---:|
| Datenbankaufruf einschließlich Data-API-Verbindung | 62,92 / 204,76 ms | 57,70 / 127,54 ms |
| Handler insgesamt | 67,54 / 210,99 ms | 63,06 / 133,84 ms |

Der restliche Anteil der Clientzeit liegt außerhalb dieses gemessenen Handlers.
Netzwerk- und Plattformschwankungen lassen sich damit nicht vollständig aufteilen.

## Neustart und Bereinigung

Vor dem Neustart wurden keine kürzlich aktiven Schiedsrichter oder offenen
HVV-Aufträge festgestellt. Die Vorher-Messung endete um 07:03:46 UTC. Der Neustart
wurde um 07:04:51 UTC angefordert und mit HTTP 200 bestätigt. Um 07:07:07 UTC waren
Datenbank, Authentifizierung und REST-API wieder als gesund dokumentiert. Dies ist
die Zeit bis zur bestätigten Verfügbarkeit, keine sekundengenaue Ausfallmessung.
Die Nachher-Messung endete um 07:09:42 UTC. Der HVV-Scheduler war danach aktiv;
sein geprüfter Lauf um 07:11 UTC war erfolgreich, offene HVV-Aufträge: 0.

Nach beiden Läufen wurden jeweils 0 verbleibende Testturniere, Spiele, Links,
Court-Sperren und HVV-Aufträge bestätigt. Bestehende Ergebnisse wurden nicht
verändert. Es gab keine Testübertragung an den HVV und keinen endgültigen
Spielabschluss in dieser Lastmessung.

## Grenzen und Reproduzierbarkeit

Ein Vorher-/Nachher-Paar von demselben Rechner aus, keine langfristige oder
statistisch abgesicherte Kapazitätsmessung. Hintergrundlast der Plattform,
Verbindungspools und Caches können die Ergebnisse mit beeinflussen. Browserrendering,
Mobilfunkverhalten und Livestreams sind nicht enthalten. Die dekomprimierten
JSON-Datenmengen sind keine Messung des tatsächlich komprimierten Egress.

Verwendet wurden `scripts/load-test-referees.mjs` und
`scripts/load-test-displays.mjs` mit dem oben beschriebenen eigenen Fixture.
Die Testdaten wurden durch einen lokalen Wrapper vor jedem Lauf angelegt und in
seinem `finally`-Block wieder entfernt. Der separate Testauftrag für die Fehlersimulation im HVV-Scheduler
war für diesen Vergleich ausgeschaltet.

Die anonymisierte Zusammenfassung einschließlich Neustartzeiten, Messwerten,
Spielstandsprüfungen und Bereinigung liegt in `supabase-restart-2026-09-11.json`.
