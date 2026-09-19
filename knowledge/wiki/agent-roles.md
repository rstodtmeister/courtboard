---
title: Agentenrollen und Übergaben
updated: 2026-09-17
status: source-reviewed
source_commit: 0fa17d309b986079df46f12883f9996d7c3af467
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
- Rollen-TOML-Dateien in der Tabelle und [Teststrategie](testing/strategy.md)
- [Wiki-Pflegeregeln](AGENTS.md)

## Offene Punkte

Der Wiki-Agent wurde in dieser Sitzung für den Quellenabgleich eingesetzt. Die übrigen
Rollen wurden dabei nicht durch eigene delegierte Aufträge zur Laufzeit geprüft.
Der Dateiname `agent-roles.md` vermeidet die Kollision mit `AGENTS.md` auf Dateisystemen,
die Groß-/Kleinschreibung nicht unterscheiden.
