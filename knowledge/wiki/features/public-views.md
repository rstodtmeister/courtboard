---
title: Öffentliche Anzeigen und Team-Begleiter
updated: 2026-09-19
status: source-reviewed
source_commit: 1c3170d01e9197e0fdf965d057639073c5096c10
---

# Öffentliche Anzeigen und Team-Begleiter

Die Routen unterstützen Courts, Gruppen, Stream-Overlay und eine persönliche Teamseite.
Die Teamfavoriten werden je Turnier im Browser gehalten; Gruppen-/Pool- und Bracket-Platzhalter
sind keine auswählbaren Teamidentitäten. Teamseiten sind über URL teilbar.
Der Begleiter zeigt ausstehende Spiele und Schiedsrichterdienste samt vorausgehenden Spielen
auf demselben Court. Gewinner-/Verliererreferenzen werden nur aus abgeschlossenen Ergebnissen
aufgelöst; unbekannte Referenzen bleiben sichtbar. Ergebnisse werden aus Sicht des gewählten
Teams angezeigt, einschließlich Satzständen und Sonderwertungen.

Punktverlauf und Auszeiten verwenden die gemeinsame PointFlow-Darstellung. Diese öffentlichen
Ergebnisdaten sind vom privaten [Adminprotokoll](protocols.md) zu unterscheiden.
Die Übersicht fragt kompakte Spielzusammenfassungen ab; detaillierte Verläufe werden bei Bedarf
geladen. Der historisch dokumentierte Fünf-Sekunden-Abfragezyklus ist keine Echtzeitgarantie.

Teamfotos sind im Adminbereich je Turnier und Setznummer zugeordnet. Der Editor erstellt einen
512×512-WebP-Ausschnitt mit Verschieben und Zoom; die Anzeige verwendet öffentliche Storage-URLs.
Dateiupload und Metadaten-Upsert sind getrennte Schritte. Im lokalen Datenmodus liefert die
Fotoliste derzeit keine Fotos. Uploadrechte betreffen berechtigte Turnieradmins.

Im Stream-Overlay stehen Foto, Teamname und Punkte in einem dreiteiligen, auf beiden Seiten
gespiegelten Raster. Die Teamfotos liegen außen als abgerundete Quadrate; Teamnamen stehen
dazwischen und die Punkte unmittelbar neben der zentralen Satzanzeige. Das Raster behält die
Zuordnung auch ohne vorhandenes Teamfoto bei. Die Bilder skalieren von 88 bis 112 Pixeln und
werden in schmalen Ansichten auf 48 bis 72 Pixel reduziert.

## Quellen

- [Routen](../../../web-admin/src/appRoutes.tsx)
- [Favoriten](../../../web-admin/src/MyTeam.tsx) und [Teamfilter](../../../web-admin/src/teamNames.ts)
- [Begleiterlogik](../../../web-admin/src/teamCompanionLogic.ts) und [Ansicht](../../../web-admin/src/TeamCompanion.tsx)
- [Verläufe](../../../web-admin/src/PointFlow.tsx) und [Nachladen](../../../web-admin/src/matchHistoryData.ts)
- [Polling](../../../web-admin/src/displayPolling.ts)
- [Fotoeditor](../../../web-admin/src/admin/TeamPhotosPanel.tsx) und [Foto-API](../../../web-admin/src/teamPhotos.ts)
- [Stream-Overlay](../../../web-admin/src/CourtDisplayApp.tsx), [Anzeigestile](../../../web-admin/src/styles.css) und [Layouttest](../../../web-admin/tests/display-loading.test.mjs)
- [Fotoschema/Rechte](../../../supabase/migrations/20260916160000_team_photos.sql) und [Storage-Lesekorrektur](../../../supabase/migrations/20260916161000_team_photo_admin_read.sql)
- [Begleitertests](../../../web-admin/tests/team-companion.test.mjs) und [Verlaufstests](../../../web-admin/tests/match-history.test.mjs)

## Offene Punkte

Für Fotoeditor/Storage-Upload ist in den gesichteten Reports kein eigener Nachweis vorhanden.
Browserfavoriten sind kein geräteübergreifendes Benutzerkonto. Aktuelle Produktionsrechte ungeprüft.
Das Overlay-Layout wurde lokal mit synthetischen Bildern gerendert; echte Streamsoftware,
Produktivdaten und verschiedene Safe-Area-Einstellungen sind nicht geprüft.
