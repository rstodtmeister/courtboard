# Spielprotokolle – Umsetzung und Prüfung vom 11.09.2026

## Bedienung

Im Adminmenü gibt es eine eigene Seite **Spielprotokolle**. Die bisherige Spieleliste erhält keine weiteren Aktionen. Das oben ausgewählte Turnier bestimmt die Protokollübersicht. Court und Erfassungsart können gefiltert werden. Ein Spiel lässt sich öffnen und einzeln als JSON oder PDF herunterladen; die Listen-Downloads enthalten alle aktuell gefilterten Spiele. Auf kleinen Displays werden Karten statt einer breiten Tabelle angezeigt.

Die Übersicht lädt keine Punkteverläufe. Einzeldetails kommen beim Öffnen in Seiten zu jeweils 100 Einträgen. Downloads lesen alle Seiten bis zu einer zu Beginn festgelegten Ereignisgrenze pro Spiel; laufende Partien halten einen Export nicht unbegrenzt offen. Die enthaltene Ergebnissnapshot wird aus genau diesen Ereignissen aufgebaut. Ein währenddessen fehlender Zugriff oder ein unvollständig lesbares Protokoll führt zu einer Fehlermeldung, nicht zu einem still gekürzten Download. Ein Gesamtdownload ist kein über alle Spiele gemeinsam atomarer Zeitpunkt.

## Aufzeichnung

- Datenbanktrigger schreiben in derselben Transaktion wie das Spiel. Es entsteht keine zusätzliche HTTP-Anfrage pro Punkt; Änderungen am Schiedsrichter-Frontend sind nicht erforderlich.
- Ausgangsdaten: Spielnummer, Runde, Datum, Court, Teams, Schiedsgericht, Wertung, Satzergebnisse, Sieger und Abschlussstatus. Nachfolgende Änderungen enthalten alte und neue Werte.
- Live-Punkte und Auszeiten werden als Änderungen des gespeicherten Verlaufs protokolliert. Die laufende 120-Einträge-Grenze bleibt bestehen, die früheren Protokollereignisse bleiben erhalten. Legacy-Speicherwege bzw. nicht inkrementelle Änderungen erhalten einen ausdrücklich gekennzeichneten Ersatzverlauf.
- Die Quellen unterscheiden Admin mit authentifizierter Benutzer-ID und E-Mail aus dem JWT, Schiedsrichter-Ergebnislink sowie Import/System. Ein Ergebnislink wird nicht als persönlicher Identitätsnachweis dargestellt. Bei serverseitigen HVV-Importen ist die Quelle System; der auslösende Admin wird damit nicht behauptet.
- Zeitangaben sind serverseitige Aufzeichnungszeitpunkte innerhalb der erfolgreichen Speicherung. Bei Offline-Eingaben entsprechen sie nicht zwingend dem tatsächlichen Zeitpunkt des Punkts. UI-Zeiten werden in der Browserzeitzone dargestellt, JSON/PDF führen UTC-Zeitangaben.
- Nur bestätigte Änderungen werden protokolliert. Die bereits vorhandene lokale Outbox schützt offene Eingaben bis zur Bestätigung. Abgewiesene Speicherungen und identische Wiederholungen einer Empfangsbestätigung erzeugen keine zusätzlichen Ereignisse.
- Reine Ergebniseingaben werden auch bei einer anfänglich leeren Historie korrekt als solche gekennzeichnet. Null, leere und bloß anders formatierte JSON-Historien werden dafür semantisch verglichen. Die Bereitstellung hat diesen Grenzfall aufgedeckt; Regressionstest und Korrektur sind enthalten.
- Bereits vorhandene Spiele werden als übernommener Ausgangsstand erfasst. Fehlende frühere Ereignisse werden nicht rekonstruiert. Ein vorhandener Restverlauf oder gemischte Ergebnis-/Adminänderungen verhindern die Einordnung als ausschließlich neue Live-Erfassung. Die Kennzeichnung ist eine Beschreibung der gespeicherten Eingabewege, kein unabhängiger Vollständigkeitsnachweis.
- Auch Teamänderungen erhöhen nun die Spielrevision, damit ein laufender Schiedsrichterstand nach einem Teamwechsel nicht unbemerkt weitergeschrieben werden kann.

## Rechte und Aufbewahrung

`game_protocols` enthält die Übersicht; `game_protocol_events` das fortlaufende Journal. Beide sind für öffentliche Benutzer unzugänglich. Angemeldete Admins lesen ausschließlich Protokolle ihrer erlaubten Turniere; die bestehende Superadmin-Sitzungssperre gilt auch hier. Normale API-Benutzer können Protokolle weder ergänzen, ändern noch löschen. Nur die Datenbanktrigger schreiben sie. Privilegierte Datenbankverwaltung ist davon nicht ausgeschlossen; es handelt sich nicht um eine kryptografisch signierte oder extern unveränderliche Archivierung.

Das Löschen eines einzelnen Spiels behält sein Protokoll mit einem Löschereignis. Das ausdrückliche Löschen des gesamten Turniers entfernt auch dessen Protokolle; die vorhandene Bestätigung nennt sie jetzt mit. JSON ist das vollständige maschinenlesbare Sicherungsformat. Ein automatischer Wiederimport ist nicht Bestandteil dieser Umsetzung. Die Archivdaten liegen in derselben Supabase-Datenbank, ein heruntergeladenes JSON kann separat aufbewahrt werden.

PDF ist eine lesbare Darstellung der Aufzeichnung, kein DVV-Formular. Die Standardschrift unterstützt die üblichen deutschen Zeichen; nicht darstellbare Sonderzeichen werden als `?` ausgegeben, während JSON die Originalzeichen vollständig bewahrt. Die Protokollseite und PDF-Bibliothek werden nur bei Bedarf geladen und nicht vom Schiedsrichter-Offline-Cache vorab geladen. Im Protokollbereich pausiert das regelmäßige Nachladen des übrigen Admin-Dashboards. Der separate lokale API-Betrieb bietet diese serverseitige Archivierung nicht an.

## Prüfung

- `npm --prefix web-admin run check`: 32 Tests für Auth, Speicherreihenfolge/Outbox, Anzeigen, HVV und Protokolle sowie TypeScript und Produktionsbuild bestanden. Zusätzlich Cloud-Produktionsbuild geprüft.
- Alle SQL-Regressionen mit PGlite und Migrationen, einschließlich `supabase/tests/game_protocols.sql`, bestanden. Getestet: über 120 Änderungen, Rücknahme, Wiederholung, Revisionskonflikt ohne Ereignis, Adminidentität und alte/neue Werte, RLS-Zugriff, keine Browsermutation, Spiel-Löscharchiv, Turnierlöschung und reine Ergebniseingabe mit leerer Historie. Für den lokalen SQL-Runner wurde wegen sporadischer Stillstände unter Node 23 eine isolierte Node-22-Laufzeit verwendet.
- Chromium/Playwright: tatsächliche Adminnavigation, Filter, keine Historienabfrage in der Liste, 105 Ereignisse ohne Kürzung, echte JSON-/PDF-Downloads und mobile Ansicht einschließlich sichtbarer Öffnen-Aktion. Keine unbehandelten Browserfehler.
- JSON-Export-Regression mit 205 Ereignissen und festem Endpunkt sowie Abbruch bei verlorenem Lesezugriff. PDF-Regression mit 150 Ereignissen über mehrere Seiten.
- Echter Supabase-Ergebnisabschluss an einem eigenen temporären Spiel: 494 ms; identische Wiederholung 409 ms. Genau zwei Ereignisse einschließlich Anlage, Quelle Schiedsrichter/Ergebnis-only, keine doppelte Protokollierung und keine HVV-Auslieferung ohne Ziel-URL. Fixture entfernt.

Browser-Test: Einen Cloud-Devserver mit `VITE_DATA_MODE=supabase`, `VITE_SUPABASE_URL=https://example.supabase.co`, `VITE_SUPABASE_ANON_KEY=sb_publishable_browser_test` auf Port 4174 starten. Dann `scripts/test-protocol-browser.mjs` mit installiertem Playwright/Chromium ausführen. `PLAYWRIGHT_MODULE` kann auf eine externe Playwright-`index.mjs` zeigen; `PROTOCOL_PREVIEW_URL` überschreibt die Testadresse. Der Test verwendet `web-admin/tests/browser/protocols.html` mit echter Adminseite und vollständig simuliertem Backend. Die Testseite gehört nicht zum Produktionsbuild.

## Lasttest mit vollständiger Protokollierung

Eigene temporäre Fixture mit 120 Spielen, davon vier laufend. Vier Schiedsrichter schreiben alle zwei Sekunden; jede zehnte Änderung ist eine Rücknahme. Zunächst 30 Sekunden ohne Zuschauer, anschließend 120 Sekunden mit 50 Zuschauern. Keine echten Spiele geändert und keine Ergebnisse an HVV gesendet.

| Messung im gemeinsamen Abschnitt | Ergebnis |
|---|---:|
| Speicherungen | 240 |
| Speicherfehler | 0 |
| Speichern Median / 95. Perzentil / Maximum | 261 / 377 / 635 ms |
| Zuschauerabfragen | 1.300 |
| Fehler bei Zuschauerabfragen | 0 |
| Zuschauer Median / 95. Perzentil / Maximum | 143 / 333 / 504 ms |
| Endstände einschließlich gespeichertem Verlauf korrekt | 4 von 4 |

Ein erster Lauf mit Protokollierung vor der Normalisierung leerer Historien lag bei 258 / 372 / 1.789 ms für die Speicherungen. Der frühere Lauf ohne Archiv lag bei 259 / 333 / 1.916 ms. Diese einzelnen kurzen Läufe unter schwankenden Bedingungen erlauben keine genaue kausale Bestimmung des Datenbank-Mehraufwands und keine Lastgarantie. Der Median bleibt in diesen Messungen ähnlich; die Perzentile und Ausreißer schwanken.

Die vollständige Cleanup-Prüfung bestätigt null verbleibende Test-Turniere, Spiele, Links, Locks, HVV-Jobs, Protokolle und Ereignisse. Rohmessungen und Prüfergebnisse stehen in der benachbarten JSON-Datei; sie enthalten keine Zugangsschlüssel oder Linktokens.
