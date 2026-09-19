# Wiki-Aktualisierungslog

Neue Einträge anhängen; frühere Ereignisse nicht nachträglich umdeuten.

## [2026-09-17] ingest | Ersteinrichtung

- Nutzeranforderungen als unveränderten Eingangsbeleg aufgenommen.
- Projektquellen am Commit `0fa17d309b986079df46f12883f9996d7c3af467` gelesen.
- Architektur, Erfassung, Protokolle, Tests, Betrieb und Agentenrollen verlinkt.
- Testberichte vom 11.09.2026 ausdrücklich als historische Nachweise eingeordnet.
- Kein aktueller Anwendungstestlauf und keine produktive Supabase-Prüfung behauptet.
- Strukturprüfung `python3 scripts/check-knowledge.py` erfolgreich: lokale Links, Indexabdeckung und Pflichtmetadaten gültig.
- `git diff --check` erfolgreich; die neu angelegten Dateien waren dabei noch unversioniert.
- Keine Anwendungsdateien, CI-Konfiguration oder Live-Daten geändert.

## [2026-09-17] ingest | Projekt-Subagenten eingerichtet

- Acht benannte Agenten in `.codex/agents/` angelegt; Hauptagent bleibt Koordinator.
- Datenbank und Backend getrennt; unabhängiger Test-Agent mit Nachweispflicht eingerichtet.
- Sicherheitsreview lesend konfiguriert; Modelle und übrige Berechtigungen werden geerbt.
- Projektkonfiguration begrenzt gleichzeitig offene Subagenten auf drei.
- Rollenübersicht und gemeinsame Projektanweisungen aktualisiert.
- Kein Anwendungstest, Deployment oder Modellaufruf zur Laufzeitaktivierung durchgeführt.
- Prüfung erfolgreich: acht TOML-Dateien, eindeutige Namen, Pflichtfelder, Modellvererbung und Wiki-Verlinkung.
- `codex features list` erfolgreich; dies ist kein Laufzeitnachweis für die Agentenauswahl.
- Strenge CLI-Prüfung über `codex --strict-config features list` nicht verfügbar: Unterbefehl unterstützt die Option nicht.

## [2026-09-17] reconcile | Wiki gegen Quellenstand abgeglichen

- Quellen: HEAD `0fa17d309b986079df46f12883f9996d7c3af467`, jüngste 45 Git-Einträge,
  aktuelle Frontend-/Edge-/Migrationsquellen, vorhandene Testdateien und sechs Reportthemen.
  Wissensdateien und Agentenkonfiguration sind im Arbeitsbaum noch unversioniert.
- Öffentliche Ansichten/Team-Begleiter/Fotos, HVV-Import/Schiedsrichter und YouTube-Replays
  ergänzt; belegte Implementierungsentscheidungen mit Commitreferenzen aufgenommen.
- Erfassung korrigiert: aktueller automatischer Konfliktabgleich übernimmt Serverstand,
  leert blockierte Pending-Operationen und führt keinen Merge aus. Spielerbezeichnungen
  und spätere Protokoll-/Admin-/Rechteänderungen ergänzt.
- Fehlerhafte Dateibelegung behoben: bisheriger Rolleninhalt von `AGENTS.md` in `agents.md`
  bewahrt; tatsächliche Wiki-Pflegeregeln in `AGENTS.md` hergestellt. Historische Logeinträge
  bleiben unverändert; ihre damalige Strukturprüfung wurde hier nicht erneut behauptet.
- Historische Last-/Neustartberichte ergänzt, einschließlich ungeklärtem Timeout des ersten
  Performanceversuchs und Grenzen von HTTP-/Mock-/PGlite-/gehosteten Nachweisen.
- Tatsächliche Prüfung: `python3 scripts/check-knowledge.py`, lokal am 17.09.2026,
  erfolgreich: lokale Links, Indexabdeckung und Pflichtmetadaten gültig.
- Keine Anwendungstests, Live-Prüfungen oder Deployments ausgeführt. Strukturprüfung
  bestätigt keine semantische Vollständigkeit. Detailprüfung aller Java-/Adminpfade und
  heutige E2E-/Foto-Storage-/HVV-Nachweise bleiben offene Punkte.

## [2026-09-17] presentation | Lokale Wiki-Leseansicht

- Nutzerwunsch: Wiki-Inhalte gut aufbereitet lesen. Akzeptanzkriterien: alle Wiki-Seiten
  aus Markdown erzeugen, Themen-Navigation, Volltextfilter, Quellenstand/Testgrenzen,
  lokale Quellenlinks und Druckansicht; offline ohne zusätzliche Pakete öffnen.
- [Generator](../../scripts/build-wiki-reader.py) und [Leseansicht](../reading.html)
  ergänzt. [Benutzung](../README.md), Index und Wiki-Entscheidung aktualisiert.
  Die HTML-Datei ist eine Momentaufnahme und wird nach Wiki-Änderungen neu erzeugt.
- Nachprüfung entdeckte einen Fehler im vorherigen Abgleich: `agents.md` kollidiert
  mit `AGENTS.md` auf diesem Dateisystem. Die behauptete Trennung war dadurch nicht
  erhalten geblieben. Rollen unter [agent-roles.md](agent-roles.md) wiederhergestellt;
  aktive Links korrigiert. Frühere Logeinträge bleiben als historische Aussagen erhalten.
- Strukturprüfung prüft nun auch exakte Groß-/Kleinschreibung lokaler Linkziele.
- Tatsächliche lokale Prüfungen: `python3 scripts/check-knowledge.py` erfolgreich;
  `python3 scripts/build-wiki-reader.py` erzeugt 15 unterschiedliche Wiki-Seiten.
  Python-Smokeprüfung bestätigt Seitenabdeckung, interne/Quellenlinks sowie Ablehnung
  des falschen Dateinamens. `node --check` für erzeugtes Client-JavaScript erfolgreich.
  Node/VM mit DOM-Testdouble prüft Volltextfilter, leere Trefferliste, Themenwechsel,
  unbekanntes Thema und Druckaktion erfolgreich; dies ist kein Browser-Interaktionstest.
- Vorhandener Chromium rendert Startseite und Navigation mittels `--dump-dom`.
  Erster Browserstart in der Sandbox scheiterte an macOS-Prozessrechten; der genehmigte
  Start außerhalb der Sandbox war erfolgreich. Keine Prüfung echter Druck-/PDF-Ausgabe
  oder vollständige visuelle Prüfung auf Mobilgeräten. Keine Anwendungs-/Live-Tests.
- Quellenstand weiterhin `0fa17d309b986079df46f12883f9996d7c3af467` plus lokale Änderungen.

## [2026-09-17] rules | Wiederholungsschleifen begrenzen

- Auf Nutzerauftrag den zuvor vorgeschlagenen Abschnitt „Schleifen vermeiden“ unverändert
  in die [Projektanweisungen](../../AGENTS.md) aufgenommen.
- Höchstens drei Versuche desselben fehlgeschlagenen Schritts; Ursachenprüfung,
  begründete Wiederholung, Auswertung gestoppter Lösungswege und Sicherung bei Blockaden.
  Erfolgreiche Tests nur bei relevanten Änderungen oder konkreten Zweifeln wiederholen.
  Der Hauptagent überwacht die Regeln auch für Subagenten.
- [Agentenrollen](agent-roles.md) und Index ergänzt. Verhaltensregel ausdrücklich von
  einem technisch erzwungenen Versuchszähler unterschieden.
- Tatsächliche lokale Prüfung: `python3 scripts/check-knowledge.py` erfolgreich am
  17.09.2026; Links, Index und Pflichtmetadaten gültig. Reine Anweisungs-/Wiki-Änderung,
  keine Anwendungstests oder Live-Aktionen. Wissensdateien weiterhin unversioniert.

## [2026-09-19] frontend | Eindeutige Livestream-Aktionen

- Unter Courts → Livestream sind „Stream speichern“ und „Stream entfernen“ getrennte
  Schaltflächen. Speichern ist nur für einen nicht leeren, geänderten Entwurf aktiv;
  Entfernen nur bei einem gespeicherten Stream. Die ausgelöste Aktion zeigt ihren eigenen
  Fortschrittszustand.
- Zustandstest für leere, neue, unveränderte, geänderte und geleerte Eingaben ergänzt.
- Tatsächliche lokale Prüfungen auf HEAD `0fa17d309b986079df46f12883f9996d7c3af467`
  mit lokalen Änderungen: gezielter Court-Test und TypeScript-Prüfung erfolgreich. Der
  vollständige `npm --prefix web-admin run check` lief bis einschließlich Referee-Tests
  erfolgreich, bevor die Werkzeug-Zeitgrenze die Ausgabe beendete; die ausstehenden
  Companion-Tests und der Produktionsbuild wurden separat erfolgreich ausgeführt.
- Kein Live-YouTube-Abruf und keine Supabase-Prüfung.
- Nachträglicher Browser-Nachweis: `node scripts/test-court-stream-browser.mjs` steuerte
  Google Chrome headless bei 390 × 844 Pixeln und bestätigte Eingabe, Speichern,
  unveränderten/geänderten Zustand, Entfernen, Rücksetzen des Feldes und mobile Breite.
  Dafür wurde `playwright-core` temporär nur unter dem ignorierten `node_modules` ergänzt;
  Manifest und Lockfile blieben unverändert. Kein Backend- oder Live-YouTube-Aufruf.
