# Öffentliche Anzeigen und Schiedsrichter: Optimierung und erneuter Lasttest

## Änderungen

1. Die öffentliche Übersicht lädt einen gespeicherten kompakten Status für
   Spielbeginn und Auszeiten statt vollständiger Punkteverläufe. Die Datenbank
   berechnet diesen Status beim Schreiben. Die Einzelcourt-Ansicht erhält weiterhin
   ihre benötigten Verläufe. Die bestehende Fünf-Sekunden-Abfragepause bleibt erhalten.
2. Die Schiedsrichter-Speicherung verwendet einen einzigen transaktionalen
   Datenbankaufruf für Token- und Spielprüfung, Court-Sperre, Spielstand und
   Link-Nutzung. `Server-Timing` macht die Teilzeiten sichtbar.
3. Ein Spielabschluss legt seinen HVV-Auftrag in derselben Transaktion ab. Er
   wartet nicht mehr auf den HVV. Hintergrundprozess, minutlicher Scheduler,
   zeitlich begrenzte Bearbeitungsrechte und begrenzte Wiederholungen sichern die
   Verarbeitung ab. Die Abschlussseite zeigt den Übertragungsstatus.
4. Die Kombination aus 50 Zuschauern und vier Schreibern wurde mit einem größeren
   synthetischen Turnier erneut getestet.

## Testaufbau

120 eigene Testspiele, davon vier aktive und 116 abgeschlossene. Bereits vor dem
Test enthalten die Spiele 100 bis 108 Historieneinträge. Die vier Schiedsrichter
spielen im dritten Satz nach 21:19 und 19:21 weiter, ungefähr eine Änderung alle
zwei Sekunden; jede zehnte Änderung nimmt einen Punkt zurück. Wie im Frontend
werden höchstens die letzten 120 Historieneinträge übertragen.

30 Sekunden Vergleichsmessung ohne Zuschauer, danach 120 Sekunden mit 50
Zuschauern. Diese laden alle 120 Spielzusammenfassungen, aber keine vollständigen
Historien. Die Tests verwenden HTTP-Clients von einem Rechner aus; Browserrendering,
Mobilfunkverbindungen und Livestreams sind nicht enthalten.

## Ergebnisse des vollständigen zweiten Laufs

Abgeschlossen am 10.09.2026 um 14:19:15 UTC.

| Messung | Anfragen | Fehler | Median | 95. Perzentil | Maximum |
|---|---:|---:|---:|---:|---:|
| Speichern ohne Zuschauer | 61 | 0 | 260 ms | 737 ms | 1.112 ms |
| Speichern mit 50 Zuschauern | 241 | 0 | 260 ms | 377 ms | 996 ms |
| Court-Heartbeats | 8 | 0 | 249 ms | 326 ms | 326 ms |
| Zuschauer während der Eingaben | 1.300 | 0 | 69 ms | 208 ms | 1.444 ms |

Alle vier finalen Spielstände und alle jeweils 120 übertragenen Historieneinträge
stimmen exakt. Zwei Courts enden im dritten Satz bei 41:41, zwei bei 41:40.
Die geringe Differenz entsteht durch unabhängig laufende, zeitlich begrenzte
Schreibschleifen. Die Zuschauer durchliefen 1.200 Aktualisierungen und empfingen
75,91 MB **dekomprimiertes JSON**; dies ist nicht die komprimierte Netzwerk- oder
abgerechnete Egress-Menge.

Die Server-Timing-Messung über 241 Speicherungen ergab:

| Abschnitt | Median | 95. Perzentil |
|---|---:|---:|
| Token-Hash | 0,68 ms | 1,37 ms |
| Eingabevalidierung | 0,41 ms | 0,61 ms |
| Datenbankaufruf einschließlich Data-API-Verbindung | 61,76 ms | 142,48 ms |
| Handler bis zur Antwort | 67,01 ms | 149,09 ms |

Die Differenz zur Clientmessung enthält weitere Netzwerk- und Plattformanteile;
sie wurde nicht weiter aufgeteilt. Der frühere Test mit nur 18 Spielen hatte beim
Speichern unter Last ein 95. Perzentil von 492 ms. Die unterschiedlichen Datenmengen
und Zeitpunkte erlauben keinen kontrollierten prozentualen Geschwindigkeitsvergleich.

## Fehlgeschlagener erster Anlauf

Der erste Versuch wurde nach der Vergleichsphase abgebrochen: 58 Speicheranfragen,
davon eine clientseitige Zeitüberschreitung nach 15 Sekunden. Median 289 ms,
95. Perzentil 2.307 ms. Die Zuschauerstufe wurde nicht gestartet. Alle Testdaten
wurden entfernt. Der Fehler wird nicht aus der Gesamtbewertung ausgeblendet.

Die spätere Datenbankprüfung zeigte keine blockierten Anfragen. Der Scheduler war
aktiv und seine SQL-Aufrufe erfolgreich. Die verfügbaren Funktionslogs enthielten
HTTP-200-Antworten, aber keine eindeutig dem Timeout zuordenbare fehlgeschlagene
Anfrage. Die Ursache bleibt ungeklärt. Der zweite Versuch lief ohne Änderung am
Anwendungscode vollständig durch. Das Testskript bewahrt nun auch bei einem frühen
Abbruch die Einzelmessungen. Ein dauerhaft störungsfreier Betrieb ist durch den
kurzen erfolgreichen Wiederholungstest nicht bewiesen.

## Spielabschluss und Hintergrundverarbeitung

- Separater echter `submit-score`-Spielabschluss ohne HVV-Ziel: 444 ms, Ergebnis
  und Sieger korrekt, Status `not_configured`; Testspiel anschließend entfernt.
- Ein eigener Queue-Auftrag ohne externe Zieladresse wurde absichtlich auf
  `queued` gesetzt. Der Scheduler rief den abgesicherten Worker auf; zwei Versuche
  wurden protokolliert. Der fehlende Bearbeiten-Link führte erwartungsgemäß zum
  Status `retry`. Es wurde nichts an den HVV geschickt.
- Lokale SQL-Tests prüfen Auftragserstellung mit dem Ergebnis in einer Transaktion,
  Token-Grenzen, Zugriffsrechte, Phasenwechsel, Wiederholungen, abgelaufene Leases,
  Schutz vor alten Bestätigungen und zwischenzeitlich geänderte Ergebnisse.
- Sechs Worker-/Endpoint-Tests prüfen Erfolg, Fehler beim Übertragen, Fehler beim
  Nachladen, Wiederholung nur des Nachladens, veraltete Bearbeitung und die sofortige
  Speicherbestätigung trotz noch laufender Hintergrundarbeit. HVV-Aufrufe sind dabei
  simuliert. Eine reale Ergebnisübertragung an den Verband wurde nicht ausgelöst.

Nach dem großen Test waren für das Testturnier **0 Turniere, 0 Spiele, 0 Links,
0 Court-Sperren und 0 HVV-Aufträge** übrig. Alle 25 Frontend-/Endpoint-Tests,
TypeScript-Prüfung, Produktionsbuild und Deno-Prüfung der Edge-Funktionen bestanden.

Die anonymisierte Messzusammenfassung liegt in `public-performance-2026-09-10.json`.
Die frühere Vergleichsmessung bleibt in `combined-load-test-2026-09-10.md` erhalten.
