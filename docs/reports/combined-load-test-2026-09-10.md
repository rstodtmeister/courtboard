# Kombinierter Lasttest: 50 Zuschauer und vier Schiedsrichter

Getesteter Anwendungsstand: `ce20c13`, 10. September 2026.

## Ablauf

Auf dem produktiven Supabase-Backend wurde ein separates, ausdrücklich als
Lasttest gekennzeichnetes Turnier mit 18 synthetischen Spielen erstellt. Vier
Court-Links mit kurzlebigen, zufälligen Tokens erlaubten ausschließlich Zugriff
auf dieses Testturnier. Bestehende Spiele wurden nicht verändert.

Vier unabhängige Schiedsrichter simulieren je einen Court. Je Court wird ungefähr
alle zwei Sekunden ein Punkt gespeichert; jede zehnte Änderung nimmt den letzten
Punkt zurück. Verwendet werden die tatsächliche `submit-score`-Edge-Function und
die Warteschlange aus `web-admin/src/scoreSaveQueue.ts`. Jeder Court wartet auf
seine vorherige Speicherung. Die Court-Sperren werden zusätzlich etwa einmal pro
Minute über den regulären Heartbeat verlängert. Alle Eingaben enthalten den
jeweils vollständigen, wachsenden Punkteverlauf.

Zunächst laufen vier Schreiber 30 Sekunden ohne simulierte Zuschauer. Danach
laufen sie weitere 120 Sekunden zusammen mit 50 simulierten Übersichtsbesuchern.
Diese laden die Spielübersicht und die Punkteverläufe der vier aktiven Spiele,
warten nach jeder Aktualisierung fünf Sekunden und laden Turnierdaten höchstens
einmal pro Minute. Die Zuschauer starten innerhalb einer Sekunde.

Am Ende werden die gespeicherten Satzstände und vollständigen Punkteverläufe aller
vier Testspiele mit der zuletzt erfolgreich bestätigten Eingabe verglichen.
Anschließend wird ausschließlich das anhand seiner zufälligen UUID und seines
Testnamens identifizierte Testturnier gelöscht; zugehörige Spiele, Links und
Court-Sperren werden über die vorhandenen Fremdschlüssel entfernt. Die Bereinigung
wird separat per Datenbankabfrage kontrolliert.

## Ergebnisse

Abgeschlossen: 2026-09-10T13:47:11.296Z (UTC).

| Messung | Anfragen | Fehler | Median | 95. Perzentil | Maximum |
|---|---:|---:|---:|---:|---:|
| Speichern ohne Zuschauer (30 s) | 61 | 0 | 383 ms | 1386 ms | 2716 ms |
| Speichern mit 50 Zuschauern (120 s) | 240 | 0 | 365 ms | 492 ms | 876 ms |
| Court-Heartbeats | 8 | 0 | 315 ms | 535 ms | 535 ms |
| Zuschauer mit vier Schreibern (120 s) | 2500 | 0 | 62 ms | 174 ms | 633 ms |

Unter Zuschauerlast wurden 240 Spielstände erfolgreich bestätigt. Zusätzlich
waren alle acht Heartbeats erfolgreich. Die Zuschauer absolvierten 1.200
Aktualisierungsdurchläufe mit zusammen 2.500 Anfragen, etwa 20,8 Anfragen pro
Sekunde. 95 % der vollständigen Anzeigeaktualisierungen benötigten weniger als
305 ms. Die Zuschauer empfingen insgesamt 20,34 MB dekomprimierte JSON-Daten.

In der vorangestellten Vergleichsmessung trat eine einzelne Antwortzeit von
2,72 Sekunden auf. Unter kombinierter Last lag das Maximum der Speicherzeiten
bei 876 ms. Ob die anfänglichen Spitzen durch Aufwärmeffekte entstanden, wurde
nicht gesondert gemessen.

Alle vier finalen Spielstände und Punkteverläufe stimmen exakt mit den zuletzt
bestätigten Eingaben überein. Drei Courts endeten bei 31:30 mit 61 Historieneinträgen,
einer bei 31:31 mit 62 Einträgen. Die unterschiedliche Anzahl entsteht durch die
zeitlich begrenzten, voneinander unabhängigen Schreibschleifen.

Die abschließende Bereinigungsabfrage ergab für dieses Testturnier: **0 Turniere,
0 Spiele, 0 Links und 0 Court-Sperren**.

Bewertung: Die getestete Kombination aus 50 Zuschauern und vier aktiven Courts
zeigte weder Anfragefehler noch abweichende finale Spielstände. Die kurze Messung
ersetzt keinen mehrstündigen Turniertest und deckt den HVV-Spielabschluss nicht ab.

## Grenzen

Kein Spiel wird mit `completed: true` abgeschlossen: Dieser Weg würde zusätzlich
HVV-Aufrufe auslösen. Spielabschluss, HVV-Synchronisation und Folgespielübergang sind
somit nicht Bestandteil dieses Tests. Ebenso wenig werden Browserdarstellung,
Gerätewechsel, Paketverlust oder echtes Mobilfunkverhalten simuliert. Alle Clients
laufen von einem Rechner aus und nutzen einen gemeinsamen HTTP-Verbindungspool.

Die Messung ist kurz und enthält nur 18 Spiele. Historien beginnen leer und wachsen
während des Tests; sehr große Turniere und bereits vollständig gefüllte Historien
sind nicht abgedeckt. Die Vergleichsmessung läuft zuerst und kann Aufwärmeffekte
enthalten; Unterschiede beweisen keinen kausalen Einfluss der Zuschauerlast.
Datenmengen beziehen sich auf dekomprimierte JSON-Antworten.

## Testskripte

- `scripts/load-test-displays.mjs`: Mit `LOAD_TEST_50_ONLY=1` ausschließlich die
  begrenzte Stufe mit 50 Zuschauern für 120 Sekunden.
- `scripts/load-test-referees.mjs`: Führt Vergleichsmessung, kombinierten Test und
  abschließenden Spielstandsvergleich durch. Benötigt die installierten
  Web-Abhängigkeiten und `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `LOAD_TEST_FIXTURE`.
  Die Fixture ist eine private JSON-Datei mit `purpose` gleich
  `courtboard-disposable-load-test`, `tournamentId` und vier `games` mit jeweils
  `id`, `court`, `token`. Sie darf nur eigens angelegte Testspiele enthalten.

Die Fixture-Erstellung und Bereinigung im `finally`-Block wurden für diesen Lauf durch
einen separaten lokalen Wrapper vorgenommen. Das Schreibtest-Skript allein legt
keine Fixtures an und entfernt sie auch nicht. Ein neuer Lauf benötigt dieselbe
kontrollierte Vorbereitung und Bereinigung. Tokens und Zugangsdaten sind nicht
Teil des Berichts oder des Repositorys.
