# CourtBoard – Zusammenarbeit und Projektwissen

Vor relevanten Entwicklungsaufgaben [Wiki-Index](knowledge/wiki/index.md) und
[Teststrategie](knowledge/wiki/testing/strategy.md) lesen. Für Wiki-Arbeit gelten
zusätzlich die [Pflegeregeln](knowledge/wiki/AGENTS.md).

Bei funktionalen Änderungen Akzeptanzkriterien festlegen und relevante Tests ausführen.
Tests sind ein Abschlusskriterium. Fehlende Umgebungen, Fehler und ungeprüfte Fälle
explizit melden. Vorhandene Tests oder alte Berichte nicht als heutigen erfolgreichen Lauf ausgeben.

Nutze bei größeren Aufgaben unabhängige Subagenten für Entwicklung und Testprüfung,
soweit die Sitzung dies ermöglicht. Rollen und Übergaben stehen in
[Agentenrollen](knowledge/wiki/agent-roles.md). Projektagenten sind in `.codex/agents/` angelegt: frontend, database, backend, test_agent,
security_reviewer, wiki_agent, release_agent und java_agent. Der Hauptagent koordiniert.
Bei größeren funktionalen Änderungen test_agent für unabhängige Prüfung einsetzen.
Dateizuständigkeiten vor parallelen Änderungen
festlegen; höchstens drei Subagenten gleichzeitig. Kleine Aufgaben lokal erledigen.

Nach relevanten Änderungen bestätigte Erkenntnisse und Testnachweise in die Wiki
integrieren, Quellen verlinken und Index/Log aktualisieren. Ein Wiki-Agent kann diese
Pflege übernehmen; innerhalb eines parallelen Auftrags schreibt nur ein Agent gemeinsame Wiki-Seiten.

Die Wiki ist abgeleitetes Wissen. Bei Widersprüchen aktuellen Code, Migrationen und
Originalbelege prüfen. Keine Secrets oder sensiblen Live-Daten in Wiki oder Logs aufnehmen.
Befugnisse für Deployments und externe Aktionen ergeben sich aus dem Nutzerauftrag.

Strukturprüfung: `python3 scripts/check-knowledge.py`.

## Schleifen vermeiden

- Wiederhole denselben fehlgeschlagenen Schritt höchstens dreimal.
  Leicht veränderte Befehle mit derselben Fehlerursache zählen mit.
- Prüfe nach jedem Fehlschlag die Ursache. Wiederhole einen Versuch
  nur mit einer begründeten Änderung oder bei einem erkennbar
  vorübergehenden Fehler.
- Nach drei erfolglosen Versuchen: Stoppe diesen Lösungsweg und
  fasse Versuche, Ergebnisse und vermutete Ursache zusammen.
- Ein anderer Lösungsweg ist erlaubt, wenn er auf neuen Erkenntnissen
  beruht. Bereits gescheiterte Wege nicht erneut durchlaufen.
- Wenn kein sinnvoller nächster Schritt möglich ist: Sichere den
  Arbeitsstand und melde die konkrete Blockade sowie die benötigte
  Information. Unabhängige Arbeiten können fortgesetzt werden.
- Wiederhole erfolgreiche Tests nur nach relevanten Änderungen
  oder bei konkreten Zweifeln am Ergebnis.
- Der Hauptagent überwacht diese Regeln auch für Subagenten.
