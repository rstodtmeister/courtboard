---
title: Spielprotokolle
updated: 2026-09-17
status: source-reviewed
source_commit: 0fa17d309b986079df46f12883f9996d7c3af467
---

# Spielprotokolle

Laut Bericht vom 11.09.2026 zeichnen Datenbanktrigger bestätigte Änderungen in derselben
Transaktion wie das Spiel auf. Identische Wiederholungen erzeugen keine doppelten Ereignisse.
Die Adminansicht lädt Detailereignisse seitenweise; JSON/PDF-Exports verwenden eine feste
Ereignisgrenze je Spiel. Protokolle sind privat und auf erlaubte Turniere beschränkt.
Ein einzelnes gelöschtes Spiel behält sein Archiv; Turnierlöschung entfernt die Protokolle.

Ein Ergebnislink ist kein persönlicher Identitätsnachweis. Offline-Eingaben haben einen
serverseitigen Aufzeichnungszeitpunkt, der vom tatsächlichen Punktzeitpunkt abweichen kann.
Die Archivierung ist nicht extern unveränderlich oder kryptografisch signiert.
Der Bericht nennt einen behobenen Grenzfall bei leeren Historien mit Regressionstest.
Siehe [Nachweise](../testing/evidence.md).

## Spätere Darstellungsänderungen

Nach dem ursprünglichen Bericht wurden Score-Ereignisse als aufklappbare Zeilen mit
kompakter Satzhistorie zusammengefasst (`99c0a08`, `3adeb8d`). Die PDF-Zusammenfassung
packt mehrere Spiele auf gemeinsame Seiten (`0c2d108`); sie ist ein kompaktes Exportformat,
kein vollständiger Ersatz für sämtliche Detailereignisse. Quellenstand ist der aktuelle
Repository-HEAD; der Bericht von 11.09. bleibt ein historischer Nachweis.

## Quellen

- [Umsetzung und Prüfbericht](../../../docs/reports/game-protocols-2026-09-11.md)
- [Rohdaten](../../../docs/reports/game-protocols-2026-09-11.json)
- [SQL-Tests](../../../supabase/tests/game_protocols.sql)
- [Ereigniszeilen](../../../web-admin/src/admin/ProtocolEventItem.tsx) und [PDF](../../../web-admin/src/protocolPdf.ts)
- [Frontend-Tests](../../../web-admin/tests/game-protocols.test.mjs)
- [Browser-Test](../../../scripts/test-protocol-browser.mjs)

## Offene Punkte

Aktuelle Testläufe und produktive Zugriffsregeln sind bei Einrichtung nicht neu verifiziert worden.
