---
title: Entscheidung zur LLM-Wiki
updated: 2026-09-17
status: source-reviewed
source_commit: 0fa17d309b986079df46f12883f9996d7c3af467
---

# Entscheidung zur LLM-Wiki

Der Nutzer hat die Einrichtung einer LLM-Wiki beauftragt. Als Umsetzung wird eine lokale,
Git-versionierte Markdown-Wissensbasis gewählt: unveränderte Eingangsbelege, abgeleitete
verlinkte Seiten und Regeln für Aufnahme, Fragen und Wartung. Bestehende Quellen im
Repository werden referenziert statt dupliziert.

Die Anwendung braucht dafür keine neue Supabase-Tabelle. Die Wiki gehört zum
Entwicklungsprozess und ist über Dateien lesbar. Auf späteren Nutzerwunsch gibt es eine
lokale, erzeugte [Browser-Leseansicht](../../reading.html) mit Themen-Navigation, Volltextsuche
und Druckansicht. Die Markdown-Dateien bleiben die Wissensquelle. Der Generator verwendet
nur Python-Standardbibliotheken; nach Änderungen ist ein erneuter Build erforderlich.
Hintergrundautomatisierung ist nicht eingerichtet. Obsidian bleibt optional.

Projektanpassung: Code entwickelt sich weiter. Deshalb werden Quellen zusätzlich mit
Commit und zeitlicher Gültigkeit eingeordnet. Historische Testberichte bleiben als
historisch gekennzeichnet. Der Wiki-Agent ersetzt weder Testläufe noch Code-Review.

## Quellen

- [Nutzerauftrag](../../raw/2026-09-17-requirements.md)
- [Karpathys Originalkonzept](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [Umsetzungsregeln](../AGENTS.md)
- [Generator der Leseansicht](../../../scripts/build-wiki-reader.py) und [Benutzung](../../README.md)

## Offene Punkte

Automatische CI-Wiki-Prüfung und verbindliche Anwendungstest-Gates sind mögliche Folgearbeiten.
