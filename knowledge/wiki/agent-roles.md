---
title: Agentenrollen und Übergaben
updated: 2026-09-19
status: source-reviewed
source_commit: 239318c045d87ee8fd02e15d83fcbead8217c81e
---

# Agentenrollen und Übergaben

Der Hauptagent koordiniert die Projektarbeit, definiert Akzeptanzkriterien und weist
Dateizuständigkeiten zu. Die Projektkonfiguration erlaubt höchstens drei gleichzeitige
Subagenten. Kleine Aufgaben werden lokal erledigt; größere funktionale Änderungen
erhalten eine unabhängige Testprüfung. Rollen laufen für konkrete delegierte Aufträge.

| Rolle | Zuständigkeit | Konfiguration |
| --- | --- | --- |
| frontend | React/TypeScript, Oberfläche und Frontendtests | [Frontend](../../.codex/agents/frontend.toml) |
| database | Migrationen, atomare SQL-Funktionen, RLS und Datenbanktests | [Datenbank](../../.codex/agents/database.toml) |
| backend | Edge Functions, Authentifizierung, HVV-/YouTube-Integrationen | [Backend](../../.codex/agents/backend.toml) |
| test_agent | Unabhängige Regressionen, Browser-/Integrationstests und Nachweise | [Tests](../../.codex/agents/test_agent.toml) |
| security_reviewer | Lesendes Review von Rollen, Tokens und öffentlichen Zugriffen | [Sicherheit](../../.codex/agents/security_reviewer.toml) |
| wiki_agent | Bestätigtes Projektwissen, Quellen, Index und Log pflegen | [Wiki](../../.codex/agents/wiki_agent.toml) |
| release_agent | CI/Build, Release-Vorbereitung und Deployment-Abhängigkeiten | [Release](../../.codex/agents/release_agent.toml) |
| java_agent | Java-Desktopanwendung, lokale API und Java-Regressionstests | [Java](../../.codex/agents/java_agent.toml) |

## Verwendung und Übergaben

Beispielauftrag: „Nutze frontend und backend für die Änderung und lasse test_agent
unabhängig prüfen. Dokumentiere bestätigte Ergebnisse mit wiki_agent.“

Eine Übergabe nennt Umfang, betroffene Dateien, Entscheidungen, tatsächlich ausgeführte
Prüfungen mit Umgebung und Ergebnis sowie offene Aufgaben. Historische Nachweise ersetzen
keinen heutigen Testlauf. Nur ein zugewiesener Agent schreibt gemeinsame Wiki-Seiten.
Modelle und Reasoning werden laut Projektkonfiguration nicht je Rolle überschrieben;
tatsächliche Werkzeugrechte ergeben sich aus der Sitzung. Rollen sind keine Pfad-Sandboxen.

Nach Aufträgen mit Änderungen fragt der Hauptagent abschließend nach Commit und Push.
Subagenten übergeben ihren Arbeitsstand und führen diese Git-Aktionen nicht selbst aus.
Ein bereits erteilter Commit-/Push-Auftrag wird ohne erneute Nachfrage ausgeführt.

## Projektlokale Browserfreigaben

Die [Projektregeln](../../.codex/rules/default.rules) erlauben außerhalb der Sandbox nur
den installierten Google Chrome im Headless-Modus, den lokalen Web-Preview-Server und die
einzeln aufgezählten Playwright-Regressionsskripte. Für die Score-Browsertests ist zusätzlich
der konkrete lokale Playwright-/Chrome-Aufruf freigegeben. Andere Node-Skripte erhalten aus
diesen Regeln keine Freigabe. Die Regeln gelten nur bei einer vertrauenswürdigen
Projektkonfiguration und werden nach einem Codex-Neustart geladen.

## Schleifen vermeiden

Die [Projektanweisungen](../../AGENTS.md) begrenzen denselben fehlgeschlagenen Schritt
auf drei Versuche, einschließlich leicht veränderter Befehle mit gleicher Fehlerursache.
Jeder neue Versuch braucht eine begründete Änderung oder einen erkennbar vorübergehenden
Fehler. Danach wird der Lösungsweg gestoppt und ausgewertet. Alternative Wege brauchen
neue Erkenntnisse; gescheiterte Wege dürfen nicht erneut durchlaufen werden.
Bei einer Blockade wird der Arbeitsstand gesichert und die benötigte Information benannt.
Unabhängige Arbeiten können weiterlaufen. Erfolgreiche Tests werden nur bei relevanten
Änderungen oder konkreten Zweifeln wiederholt. Der Hauptagent überwacht auch Subagenten.
Dies ist eine Verhaltensregel, kein technisch erzwungener Versuchszähler.

## Quellen

- [Projektanweisungen](../../AGENTS.md)
- [Projektkonfiguration](../../.codex/config.toml)
- [Projektlokale Ausführungsregeln](../../.codex/rules/default.rules)
- Rollen-TOML-Dateien in der Tabelle und [Teststrategie](testing/strategy.md)
- [Wiki-Pflegeregeln](AGENTS.md)

## Offene Punkte

Der Wiki-Agent wurde in dieser Sitzung für den Quellenabgleich eingesetzt. Die übrigen
Rollen wurden dabei nicht durch eigene delegierte Aufträge zur Laufzeit geprüft.
Der Dateiname `agent-roles.md` vermeidet die Kollision mit `AGENTS.md` auf Dateisystemen,
die Groß-/Kleinschreibung nicht unterscheiden.
