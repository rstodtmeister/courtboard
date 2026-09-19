---
title: HVV-Import und Schiedsrichterplanung
updated: 2026-09-17
status: source-reviewed
source_commit: 0fa17d309b986079df46f12883f9996d7c3af467
---

# HVV-Import und Schiedsrichterplanung

Der HVV-Turnierdialog kann vergangene Turniere ausdrücklich einschließen; standardmäßig
werden abgelaufene Optionen ausgefiltert. Importspielnummern werden getrimmt, leere Nummern
abgelehnt, identische Doppelzeilen dedupliziert und widersprüchliche Doppelnummern abgewiesen.

Schiedsrichtervorschläge sind Empfehlungen und ersetzen keine importierte oder manuelle Zuweisung.
In Gruppen wird unter verfügbaren Teams die bisherige Einsatzhäufigkeit berücksichtigt.
Für K.-o.-Runden gelten Court-/Vorgängerspielregeln und Ausnahmen für Eröffnungsrunden;
Final- oder unbekannte Runden erhalten keine automatischen Vorschläge. Manuelle Optionen
umfassen auch Spielausgänge. HVV-Formularübertragung löst Team-/Setznummern und
Gewinner-/Verliererreferenzen auf und verweigert uneindeutige Auswahlen.

Court-QR-PDFs enthalten Schiedsrichterlinks. Solche Links erlauben Ergebniserfassung und sind
von öffentlichen Zuschauerlinks zu unterscheiden. Ergebnisübertragung läuft nach bestätigtem
Abschluss über die separate HVV-Queue: lokale/Server-Speicherung und Verbandzustellung
haben unterschiedliche Bestätigungen.

## Quellen

- [Turnierfilter](../../../supabase/functions/list-hvv-tournaments/index.ts)
- [Importvalidierung](../../../supabase/functions/_shared/import-games.ts) und [Sync](../../../supabase/functions/sync-games/index.ts)
- [Vorschlagsregeln](../../../web-admin/src/refereeSuggestions.ts)
- [HVV-Auswahlauflösung](../../../supabase/functions/_shared/hvv-referee.ts)
- [QR-PDF](../../../web-admin/src/courtQrPdf.ts)
- [HVV-Queue](../../../supabase/functions/process-hvv-deliveries/index.ts)
- [Importtests](../../../web-admin/tests/hvv-import.test.mjs), [Formulartests](../../../web-admin/tests/hvv-referee-submit.test.mjs) und [Vorschlagstests](../../../web-admin/tests/referee-suggestions.test.mjs)
- [Historische Zustellgrenzen](../../../docs/reports/public-performance-2026-09-10.md)

## Offene Punkte

Code und vorhandene Tests abgeglichen; kein aktueller Testlauf und keine reale HVV-Übertragung.
HVV-Seitenänderungen können Parser/Formulare verändern. Empfehlungen garantieren keine
vollständig konfliktfreie oder optimale Turnierplanung.
