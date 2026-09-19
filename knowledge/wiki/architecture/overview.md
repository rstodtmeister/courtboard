---
title: Architektur
updated: 2026-09-17
status: source-reviewed
source_commit: 0fa17d309b986079df46f12883f9996d7c3af467
---

# Architektur

CourtBoard umfasst eine React-19-/TypeScript-Webanwendung mit Vite, Supabase Auth,
Postgres und Edge Functions sowie eine bestehende Java-Anwendung mit lokaler API.
GitHub Pages veröffentlicht das statische Frontend. Der Browser nutzt den Supabase-Client
mit öffentlichen Konfigurationswerten; privilegierte Integrationen laufen im Backend.
Der Datenadapter unterstützt lokalen und Supabase-Betrieb. Die Betriebsarten haben
unterschiedliche Garantien; Cloud-Outbox und serverseitige Protokolle nicht pauschal
auf den lokalen Java-Betrieb übertragen.

Frontendbereiche: Adminverwaltung, mobile Ergebniserfassung, Court-Anzeige, Teamansichten.
Edge Functions übernehmen unter anderem Spielsync, Ergebnisabgabe, Adminverwaltung,
HVV-Auslieferung und YouTube-Metadaten. SQL-Migrationen definieren Schema und Zugriffsregeln.

Siehe [Erfassung](../features/scoring.md), [Tests](../testing/strategy.md)
[öffentlichen Ansichten](../features/public-views.md),
[HVV](../features/hvv-referees.md), [Replays](../features/youtube-replays.md)
und [Betrieb](../operations/deployment.md).

## Quellen

- [Webprojekt](../../../web-admin/package.json)
- [Supabase-Client](../../../web-admin/src/supabase.ts)
- [Einrichtungsdokumentation](../../../docs/web-admin-setup.md) — historisch gewachsen; enthält auch frühere Planstände.
- [Java-Build](../../../pom.xml)
- [Deployment-Workflow](../../../.github/workflows/deploy-pages.yml)

## Offene Punkte

Der tatsächliche produktive Schema-/Funktionsstand wurde bei der Wiki-Einrichtung nicht geprüft.
