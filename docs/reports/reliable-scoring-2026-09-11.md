# Zuverlässige Schiedsrichtererfassung – 11.09.2026

## Umgesetzte Reihenfolge

1. **Speichern absichern:** Jede Übertragung erhält eine UUID und die erwartete Spielrevision. Der Server prüft Ergebnislink, Court, Gerät und Revision in einer Transaktion. Er speichert eine Empfangsbestätigung zusammen mit dem Spielstand und gegebenenfalls dem HVV-Auftrag. Eine identische Wiederholung erhält dieselbe Bestätigung; veränderte Wiederholungen und veraltete Spielstände werden abgewiesen. Administratoränderungen erhöhen ebenfalls die Revision. Alte Browserseiten können ein bereits mit Protokoll 2 bearbeitetes Spiel nicht überschreiben.
2. **Sofortige Bedienung:** Punkte werden synchron im lokalen Browserjournal vorgemerkt und anschließend pro Spiel nacheinander übertragen. Die Oberfläche wartet bei laufenden Punkten nicht auf das Netz. Ein Spielabschluss gilt erst mit Serverbestätigung als abgeschlossen. Ein zweiter Erfassungs-Tab auf demselben Browserprofil wird über Web Locks gesperrt; vier separate Geräte bleiben unabhängig.
3. **Weniger Daten:** Sechs Ergebnisfelder und eine Änderung des Punkteverlaufs ersetzen die vollständige Historie in normalen Punktübertragungen. Einträge werden beibehalten, vorn entfernt oder angehängt. Korrekturen können einen größeren Ersatzverlauf benötigen. Antworten enthalten nur die kleine Empfangsbestätigung.
4. **Verbindungsabbrüche auffangen:** Das lokale Journal übersteht Neuladen. Verlorene Antworten werden mit identischer Kennung und identischem Inhalt erneut angefragt. Wiederholungen erfolgen mit 1–30 Sekunden Abstand, zusätzlich bei Rückkehr der Verbindung oder der sichtbaren Seite. Der Service Worker hält ausschließlich die Erfassungsseite und ihre benötigten Dateien offline verfügbar. API-Antworten, Tokens in Navigations-URLs und POST-Anfragen werden nicht im Service-Worker-Cache gespeichert. Admin-Dashboard und PDF-Export werden nicht vorab geladen.
5. **Zuschauerlast begrenzen:** Die bereits kompakte öffentliche Übersicht bleibt bei fünf Sekunden Abstand nach Abschluss der vorherigen Abfrage und pausiert im Hintergrund. Bei Fehlern steigen die Abstände auf 10, 20 und höchstens 30 Sekunden; nach Erfolg wieder fünf Sekunden.

## Messung am echten Supabase-Projekt

Nur eigene temporäre Testdaten: 120 Spiele, davon vier laufend mit langen Punkteverläufen; vier simulierte Schiedsrichter, eine Änderung alle zwei Sekunden, jede zehnte Änderung Rücknahme. 30 Sekunden ohne Zuschauer, anschließend 120 Sekunden mit 50 Zuschauern. Keine echten Spiele geändert, keine Ergebnisse an HVV gesendet. Die Fixture wurde vollständig entfernt; Empfangsbestätigungen werden mit ihren Spielen gelöscht.

| Messung | Ergebnis |
|---|---:|
| Speicherungen unter Zuschauerlast | 241 |
| Speicherfehler | 0 |
| Speichern Median / 95. Perzentil / Maximum | 259 / 333 / 1.916 ms |
| Zuschauerabfragen im gemeinsamen Abschnitt | 1.302 |
| Fehler bei Zuschauerabfragen | 0 |
| Zuschauerabfragen Median / 95. Perzentil / Maximum | 158 / 234 / 2.506 ms |
| Endstände einschließlich vollständiger gespeicherter Historie korrekt | 4 von 4 |
| Gesendete JSON-Spielstandsdaten, beide Abschnitte | 259.950 Byte |
| Vergleich: dieselben Änderungen mit voller Historie | 2.024.510 Byte |
| Eingesparte JSON-Nutzdaten insgesamt | 87,16 % |
| Typische Anfrage neu / voller Verlauf | 513 / 6.868 Byte |

Die Datenmengen vergleichen JSON-Anfragekörper einschließlich Gerätekennung und Linktoken, ohne HTTP/TLS-Overhead. Initiales Laden, Heartbeats, Wiederholungen und Zuschauerverkehr sind nicht Bestandteil dieser Einsparung. Der Benchmark erzeugt Protokoll-2-Anfragen; Offline-Warteschlange und Browserneustart werden separat getestet. Der Test belegt diesen kurzen Lauf, keine garantierte Obergrenze oder Dauerlastkapazität. Seltene langsame Serverantworten bestehen weiter, halten aber laufende Punkteingaben nicht mehr auf.

Ein separater echter Spielabschluss ohne HVV-Ziel wurde nach 399 ms bestätigt. Die identische Wiederholung dauerte 475 ms, lieferte dieselbe Revision und erzeugte genau eine Empfangsbestätigung.

## Prüfungen

- `npm --prefix web-admin run check`: Authentifizierung, lokale Speicherreihenfolge, neue Cloud-Warteschlange, Anzeigen und HVV; TypeScript und Produktionsbuild.
- PGlite mit allen Anwendungsmigrationen außer dem ausschließlich gehosteten Cron-/Netzwerkplan: vorhandene SQL-Suiten und `supabase/tests/reliable_score_operations.sql`. Prüft Wiederholung, Revisionskonflikt, Gerätesperre, Sperre alter Protokolle, einmaligen Abschluss/HVV-Auftrag, Administratoränderungen und fehlende Browserberechtigungen auf den internen RPC bzw. die Belegtabelle.
- Deno-Typprüfung der Edge Functions.
- Echter Chromium-Browser mit gebautem Cloud-Frontend und vollständig simuliertem Backend: zweiter Tab gesperrt; offline Punkt/Punkt/Rücknahme; vollständiges Offline-Neuladen mit richtigem sichtbarem Stand; geordnete Wiederaufnahme; offline Spielabschluss einschließlich Neuladen bleibt bis zur Serverbestätigung offen. Keine unbehandelten Browserfehler.
- Echte Lastmessung und Abschlusswiederholung wie oben; Rohmessungen in der benachbarten JSON-Datei, ohne Tokens oder Zugangsschlüssel.

Der Browser-Test liegt in `scripts/test-score-browser.mjs`. Er benötigt einen mit `VITE_DATA_MODE=supabase`, `VITE_SUPABASE_URL=https://example.supabase.co` und `VITE_SUPABASE_ANON_KEY=sb_publishable_browser_test` gebauten lokalen Preview-Server auf Port 4173 sowie Playwright/Chromium. `PLAYWRIGHT_MODULE` kann auf eine außerhalb des Repositories installierte Playwright-`index.mjs` zeigen; `SCORE_PREVIEW_URL` überschreibt die Preview-Adresse. Sämtliche Supabase-Anfragen dieses Tests werden abgefangen.

## Betrieb und Grenzen

- Für die neue Erfassung die Seite nach der Veröffentlichung neu öffnen. Die erste Einrichtung des Spiels und der Offline-Dateien benötigt Internet; bis zur fertigen Offline-Vorbereitung erscheint ein Hinweis, die Seite geöffnet zu halten.
- „Lokal gesichert“ bedeutet noch nicht „vom Server bestätigt“. Browserdaten nicht löschen und bei offenen Eingaben das Browserprofil nicht wechseln. Lokaler Browser-Speicher ist kein Schutz vor Geräteverlust, Speicherräumung oder einem Hardwaredefekt.
- Höchstens 250 unbestätigte Eingaben je Spiel. Bei Speicherproblemen stoppt die weitere Eingabe sichtbar. Bereits vorgemerkte Eingaben können weiter übertragen werden. Die letzte nicht gesicherte Eingabe bleibt, solange die Seite offen ist, in der herunterladbaren Sicherung enthalten. Nach Behebung des Speicherproblems kann die lokale Sicherung erneut versucht werden.
- Bei Revisions-, Geräte- oder Berechtigungskonflikten bleiben offene Eingaben erhalten; keine automatische Überschreibung des Serverstands. Sicherung herunterladen und mit der Turnierleitung abgleichen. Ein automatischer Import bzw. eine automatische Konfliktzusammenführung ist absichtlich nicht vorgesehen.
- Die dauerhafte Cloud-Warteschlange ist für den Supabase-Betrieb implementiert. Der separate lokale API-Betrieb verwendet weiterhin seine bisherige Speicherwarteschlange.
- Die HVV-Auslieferung bleibt getrennt: Eine bestätigte Speicherung in Courtboard kann noch auf HVV warten; deren eigener Status wird weiterhin angezeigt.
