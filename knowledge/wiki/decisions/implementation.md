---
title: Belegte Implementierungsentscheidungen
updated: 2026-09-17
status: source-reviewed
source_commit: 0fa17d309b986079df46f12883f9996d7c3af467
---

# Belegte Implementierungsentscheidungen

Die folgenden Entscheidungen sind aus Git-Historie und aktuellen Quellen abgeleitet.
Die Commit-Meldungen belegen Umsetzungsschritte; darüber hinausgehende Motive werden nicht behauptet.

| Historie | Umsetzung | Konsequenz |
| --- | --- | --- |
| `706fbcc`, `ac1c0e9` | Versionierte Outbox und persistierte Score-Session | Serverbestätigung von lokaler Sicherung trennen; Gerätewechsel braucht bestätigten Zustand |
| `724a533`, `61a2a4d` | Konflikt-Recovery schließlich automatisch mit Serverstand | Kein Merge; unbestätigte Pending-Änderungen werden bei Übernahme ersetzt |
| `a31babe`, `42929ca`, `90dafb1` | Teilbare Teamseiten, eigene Ergebnisperspektive, gemeinsame Punktdarstellung | Öffentliche Ergebnisdaten bleiben vom privaten Auditarchiv getrennt |
| `183a756`, `aeb18b2` | Eindeutige Importnummern und validierte HVV-Schiedsrichterauswahl | Uneindeutige Quell-/Formulardaten ablehnen |
| `c6bdc4d`, `d5876ec` | Timing plus Streamzuordnung beim Start | Replay hängt vom damaligen Video und kalibriertem Beginn ab |
| `0476b20` | Funktionsrechte explizit vergeben; Build-Abhängigkeiten aktualisiert | Neue RPCs nicht durch historische öffentliche Defaults freigeben |
| `8e6a0d8`, `0fa17d3` | Öffentliche Teamfotos und verschiebbarer Ausschnitt | Fotos sind öffentliche Assets; Upload und Metadaten sind separate Schritte |

## Quellen

- [Outbox](../../../web-admin/src/scoreOutbox.ts) und [Wiederaufnahme](../../../web-admin/src/ScoreSyncStatus.tsx)
- [Teamlogik](../../../web-admin/src/teamCompanionLogic.ts) und [Punktdarstellung](../../../web-admin/src/PointFlow.tsx)
- [HVV-Import](../../../supabase/functions/_shared/import-games.ts) und [Formularauswahl](../../../supabase/functions/_shared/hvv-referee.ts)
- [Replay-Dokumentation](../../../docs/youtube-replays.md)
- [Rechtehärtung](../../../supabase/migrations/20260916150000_harden_database_function_privileges.sql) und [Regression](../../../supabase/tests/function_privileges.sql)
- [Abhängigkeiten](../../../web-admin/package-lock.json)
- [Fotoeditor](../../../web-admin/src/admin/TeamPhotosPanel.tsx)
- Git: `git log -45 --oneline`, `git show --stat 0476b20`; ausgeführt beim Quellenabgleich am 17.09.2026.

## Offene Punkte

Keine formellen ADRs für sämtliche historischen Schritte vorhanden; diese Tabelle ist eine
belegte Zusammenfassung und kein nachträglich erfundener ursprünglicher Beschluss.
Implementierung gelesen und Tests verlinkt, nicht heute ausgeführt oder produktiv verifiziert.
Detaillierte vollständige Prüfung jedes Java-/Adminpfads bleibt außerhalb dieses Themenabgleichs.
