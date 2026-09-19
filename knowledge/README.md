# CourtBoard LLM-Wiki

Diese Wissensbasis ist das gemeinsame Projektgedächtnis für Mensch und Agenten.
Start: [Wiki-Index](wiki/index.md), [Pflegeregeln](wiki/AGENTS.md), [Agentenrollen](wiki/agent-roles.md).

## Im Browser lesen

[Leseansicht öffnen](reading.html): Themen-Navigation, Volltextsuche über die Wiki-Seiten,
lesbare Tabellen und „Drucken / PDF“ für die ausgewählte Seite. Die Datei kann direkt
im Browser geöffnet werden; ein Server und zusätzliche Pakete sind nicht erforderlich.
Die Suche filtert Themen nach ihrem gesamten Seiteninhalt. Quellenlinks führen weiterhin
zu den Originaldateien; deren Darstellung hängt vom Browser und Dateityp ab.

Nach Wiki-Änderungen vom Repository-Stamm aus neu erzeugen:

```bash
python3 scripts/check-knowledge.py
python3 scripts/build-wiki-reader.py
```

Die HTML-Datei ist eine erzeugte Momentaufnahme. Inhalte weiterhin in `wiki/*.md`
bearbeiten und anschließend neu bauen. Quellenstand und Testgrenzen bleiben sichtbar.

## Benutzung

- „Verarbeite diesen Testbericht in die Wiki und aktualisiere betroffene Funktionsseiten.“
- „Was wissen wir über Gerätewechsel? Nenne Quellen und offene Testlücken.“
- „Prüfe die Wiki auf Widersprüche und veraltete Aussagen gegen den aktuellen Code.“

Diese Sätze sind Arbeitsaufträge an den Agenten, keine installierten CLI-Befehle.
Die Wiki wird während solcher Aufträge gepflegt; es gibt keinen Hintergrunddienst.

`raw/` hält unveränderte Eingangsnotizen und neue Belege. Bestehende Quellen bleiben
an ihrem Ort im Repository. `wiki/` enthält daraus abgeleitetes, verlinktes Wissen.
Code wird nicht vollständig dupliziert. Änderungen werden gemeinsam mit Git versioniert.
Obsidian kann optional diesen Ordner öffnen; es ist keine Voraussetzung.

Strukturprüfung vom Repository-Stamm: `python3 scripts/check-knowledge.py`.
Sie prüft lokale Links, Indexabdeckung und Pflichtmetadaten, keine fachliche Wahrheit.
