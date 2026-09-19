---
title: YouTube-Spielaufzeichnungen
updated: 2026-09-19
status: source-reviewed
source_commit: 4351b5717318ff4231d202aacbb15de3b5daa85b
---

# YouTube-Spielaufzeichnungen

Beim ersten Satzbeginn werden Spielzeit, Court und Videozuordnung erfasst; beim Abschluss
wird die Endzeit gespeichert. Timingdaten durchlaufen dieselbe Offline-Outbox und persistierte
Erfassungssitzung wie Punkte. Der Datenbanktrigger erfasst den aktuellen Court-Stream beim
Spielstart; eine eigene Migration ergänzt fehlende Zuordnungen bei geeigneten Bestandsdaten.
Dies ist keine pauschale rückwirkende Zuordnung sämtlicher Altspiele.

Der öffentliche Replay-Link setzt abgeschlossenes Spiel, gültige Zeiten, Video-ID und
Aufzeichnungsbeginn voraus. Position: Spielbeginn minus Aufzeichnungsbeginn plus Korrektur,
abzüglich 15 Sekunden Vorlauf, frühestens 0. Spiele vor Aufzeichnungsbeginn erhalten keinen Link.
Admins können Beginn/Korrektur manuell setzen oder YouTube-Metadaten abrufen. Ein manueller
Beginn bleibt bei automatischem Abruf erhalten; fehlende Metadaten blockieren Ergebnisse nicht.
Konkrete Videolinks, korrekte Geräteuhren und weiterhin verfügbare Aufzeichnungen sind erforderlich.

Unter Courts → Livestream sind Speichern und Entfernen getrennte Aktionen. Speichern ist
nur bei einem nicht leeren, gegenüber dem gespeicherten Wert geänderten Entwurf aktiv;
Entfernen nur bei einem tatsächlich gespeicherten Stream. Beide Aktionen werden während
der laufenden Speicherung gesperrt.

Der Aufzeichnungsbeginn ist als einmalige mobile Einrichtung gestaltet. Die aktuelle
Gerätezeit kann direkt gespeichert, der Beginn von YouTube übernommen oder manuell gewählt
werden. Danach bleiben nur Zeitpunkt, Quelle und „Einstellung ändern“ sichtbar. Ältere
Video-IDs und der Video-Versatz liegen in der Bearbeitung beziehungsweise Feineinstellung.

## Quellen

- [Bedienung und Grenzen](../../../docs/youtube-replays.md)
- [Linkberechnung](../../../web-admin/src/youtubeReplay.ts)
- [Metadatenfunktion](../../../supabase/functions/youtube-recording/index.ts)
- [Replay-Schema](../../../supabase/migrations/20260916090000_youtube_match_replays.sql)
- [Stream-Erfassung](../../../supabase/migrations/20260916130000_capture_current_court_stream.sql) und [gezielter Backfill](../../../supabase/migrations/20260916131000_backfill_missing_match_stream.sql)
- [Frontendtests](../../../web-admin/tests/youtube-replay.test.mjs), [mobiler Browser-Test](../../../scripts/test-youtube-settings-browser.mjs) und [SQL-Tests](../../../supabase/tests/youtube_replays.sql)
- [Livestream-Bedienung](../../../web-admin/src/admin/CourtLinksPanel.tsx), [Zustandstest](../../../web-admin/tests/court-stream.test.mjs) und [Browser-Test](../../../scripts/test-court-stream-browser.mjs)

## Offene Punkte

Implementierung und Tests vorhanden; am 19.09.2026 wurde der vollständige lokale
Frontend-Check mit lokalem Arbeitsbaum erfolgreich ausgeführt. Ein Playwright-Test mit
lokalem Google Chrome bestätigte die Livestream-Schaltflächen einschließlich mobiler Breite.
Ein weiterer mobiler Browserlauf bestätigte die einmalige Einrichtung des Aufzeichnungsbeginns,
den kompakten Status, manuelle Bearbeitung und Versatzsteuerung.
Kein Live-YouTube-Abruf.
Nachträgliche Videoschnitte und unterschiedliche Versätze innerhalb eines Videos können
mit einer einzigen Zeitkorrektur nicht vollständig ausgeglichen werden.
