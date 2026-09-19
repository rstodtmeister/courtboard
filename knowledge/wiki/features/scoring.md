---
title: Zuverlässige Ergebniserfassung
updated: 2026-09-19
status: source-reviewed
source_commit: 9a4d93b795bb451a9763a298f17fd3f961ee8249
---

# Zuverlässige Ergebniserfassung

Der Bericht vom 11.09.2026 beschreibt eine versionierte, atomare Ergebnisspeicherung:
Operationskennung und erwartete Spielrevision verhindern veraltete Überschreibungen;
identische Wiederholungen erhalten dieselbe Bestätigung. Court-/Gerätesperren grenzen
Schreibzugriffe ein. Die Cloud-Outbox hält offene Eingaben lokal und übersteht Neuladen.
„Lokal gesichert“ bedeutet noch nicht „vom Server bestätigt“. Aktuell werden Revisionskonflikte online automatisch zugunsten des autoritativen
Serverstands aufgelöst; es findet kein Zusammenführen lokaler und fremder Punkte statt. HVV-Auslieferung hat einen eigenen Status.

Die Einrichtungsdokumentation beschreibt später die gemeinsame Speicherung von Punkten
und Erfassungszustand für Gerätewechsel. Vor dem Wechsel müssen offene Eingaben bestätigt
werden. Browserprofilverlust kann ausschließlich lokal wartende Eingaben verlieren.

Historischer Nachweis: 241 Speicherungen unter Zuschauerlast ohne Speicherfehler im
berichteten kurzen Supabase-Lauf. Das ist keine heutige Kapazitäts- oder Dauerlastgarantie.
Siehe [Nachweise](../testing/evidence.md) und [Tests](../testing/strategy.md).

Bei gleichen Spielernachnamen können unterscheidbare Bezeichnungen eingegeben werden.
Sie gelten für Kapitän und Aufschlagreihenfolge und werden im Score-Session-Zustand
für Gerätewechsel erhalten (`5937a46`).

Die Live-Erfassung zählt einen Punkt mit einem Tipp auf die jeweilige Teamfläche. Ein
350-Millisekunden-Schutz verwirft einen unmittelbar folgenden Doppeltipp; Korrekturmodus
und Rückgängig bleiben davon unberührt. Nach der letzten Satzparameter-Auswahl startet
die Punkteingabe direkt. Die frühere zusätzliche Kontrollseite wird im neuen Ablauf nicht
mehr angesteuert; ihr Zustand bleibt für bereits gespeicherte ältere Sitzungen lesbar.

## Aktueller Konfliktabgleich

Die Historie `724a533` dokumentiert zunächst eine manuelle Wiederherstellung mit Sicherung;
`61a2a4d` ersetzt diesen Ablauf durch automatische Wiederaufnahme. `ScoreSyncStatus` lädt
bei Revisionskonflikt online den Serverstand, sofern weder Speicherung noch Storagefehler
anstehen; Fehler werden erneut versucht. Bis dahin bleibt die Queue blockiert.
`adoptServer` ersetzt Revision und Entwurf und leert die blockierten Pending-Operationen.
Das kann unbestätigte lokale Änderungen ersetzen; sie werden nicht nachträglich eingemischt.
Andere blockierte Sitzungen verweisen an die Turnierleitung. Die historische Beschreibung
von 11.09. beschreibt deshalb nicht den vollständigen heutigen Bedienablauf.

## Quellen

- [Bericht zur zuverlässigen Erfassung](../../../docs/reports/reliable-scoring-2026-09-11.md)
- [Rohmessungen](../../../docs/reports/reliable-scoring-2026-09-11.json)
- [Gerätewechsel-Dokumentation](../../../docs/web-admin-setup.md)
- [Automatische Wiederaufnahme](../../../web-admin/src/ScoreSyncStatus.tsx) und [Übernahme des Serverstands](../../../web-admin/src/ScoreEntryApp.tsx)
- [Spielerbezeichnungen](../../../web-admin/src/scoreEntrySteps.tsx) und [Sitzungsserialisierung](../../../web-admin/src/scoreSession.ts)
- [Erfassungsablauf](../../../web-admin/src/ScoreEntryApp.tsx), [Doppeltipp-Regel](../../../web-admin/src/scoreLogic.ts) und [Sitzungstest](../../../web-admin/tests/score-session.test.mjs)
- [Konflikttests](../../../web-admin/tests/score-outbox.test.mjs)
- [Outbox-Implementierung](../../../web-admin/src/scoreOutbox.ts)
- [Atomare Operationen](../../../supabase/migrations/20260911080000_reliable_score_operations.sql)
- [Persistierter Zustand](../../../supabase/migrations/20260913090000_persist_score_session.sql)

## Offene Punkte

Die historischen Läufe wurden nicht für den aktuellen Commit wiederholt.
Cloud-, Browser-Mock- und lokale Java-Garantien müssen bei Änderungen separat geprüft werden.
