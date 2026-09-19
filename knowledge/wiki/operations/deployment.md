---
title: Betrieb und Veröffentlichung
updated: 2026-09-17
status: source-reviewed
source_commit: 0fa17d309b986079df46f12883f9996d7c3af467
---

# Betrieb und Veröffentlichung

Der vorhandene GitHub-Actions-Workflow baut `web-admin` und veröffentlicht auf GitHub Pages.
Ein Push auf `main` löst ihn aus; manueller Start ist ebenfalls konfiguriert.
Der Build verwendet Supabase-URL und öffentlichen Browser-Schlüssel aus GitHub-Variablen.
Privilegierte Schlüssel und Integrationsgeheimnisse gehören nicht in das Frontend oder die Wiki.

Die bestehende Betriebsdokumentation nennt für gekoppelte Änderungen die Reihenfolge:
Migrationen, benötigte Secrets, Edge Functions, Frontend. Ein Frontenddeploy allein
beweist nicht, dass Datenbank und Edge Functions zum selben Stand passen.
`verify_jwt = false` ist für ausgewählte Funktionen konfiguriert und bedeutet nicht,
dass sie ohne eigene Authentifizierung sicher aufgerufen werden können; die jeweilige
Token-/Secret-Prüfung in der Funktion muss separat geprüft werden.

Siehe [Architektur](../architecture/overview.md) und [Testlücken](../testing/strategy.md).

## Ergänzungen aus der aktuellen Historie

Admin-Logout und Umgehung des Offline-Caches für Adminnavigation wurden mit `92086d4`
eingeführt. Die Datenbankhärtung `0476b20` entzieht neue öffentliche Funktionsrechte
standardmäßig und erlaubt bestimmte Adminfunktionen ausdrücklich für Authentifizierte
und Service-Rolle. Das ist ein Schema-/Codebefund, keine Bestätigung produktiv angewendeter
Migrationen. Die Rechte-Regression liegt als SQL-Test vor.

## Quellen

- [Adminauth](../../../web-admin/src/dataApiAuth.ts) und [Cache-Konfiguration](../../../web-admin/vite.config.ts)
- [Funktionsrechte](../../../supabase/migrations/20260916150000_harden_database_function_privileges.sql) und [SQL-Test](../../../supabase/tests/function_privileges.sql)
- [Pages-Workflow](../../../.github/workflows/deploy-pages.yml)
- [Betriebsdokumentation](../../../docs/web-admin-setup.md)
- [Supabase-Konfiguration](../../../supabase/config.toml)
- [YouTube-Secrets und Konfiguration](../../../docs/youtube-replays.md)

## Offene Punkte

Keine produktive Veröffentlichung oder Live-Konfigurationsprüfung bei Wiki-Einrichtung.
Der Workflow enthält bisher kein vollständiges Testgate. Rückrollplan je Migration prüfen;
keine pauschale Rücksetzbarkeit annehmen.
