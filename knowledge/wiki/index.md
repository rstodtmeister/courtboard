# CourtBoard Wissensindex

Zuerst relevante Seiten auswählen, dann deren Quellen und Gültigkeitsgrenzen prüfen.
Stand des Quellenabgleichs: 17.09.2026, HEAD `0fa17d3` und lokale Wissensdateien. Keine Aussage über den aktuellen Produktionsstand.

[Im Browser lesen](../reading.html) · Aktualisieren: `python3 scripts/build-wiki-reader.py`

| Seite | Inhalt |
| --- | --- |
| [Architektur](architecture/overview.md) | Komponenten, Datenflüsse und Betriebsarten |
| [Erfassung](features/scoring.md) | Versionierte Speicherung, Offline-Outbox und Gerätewechsel |
| [Protokolle](features/protocols.md) | Aufzeichnung, Exporte und Zugriffsgrenzen |
| [Öffentliche Ansichten](features/public-views.md) | Courts, Team-Begleiter, Favoriten, Ergebnisse und Teamfotos |
| [HVV und Schiedsrichter](features/hvv-referees.md) | Importvalidierung, Empfehlungen, Formularübertragung und QR |
| [YouTube-Replays](features/youtube-replays.md) | Timing, Streamzuordnung und Kalibrierung |
| [Implementierungsentscheidungen](decisions/implementation.md) | Aus Git/Code belegte technische Entscheidungen und Grenzen |
| [Teststrategie](testing/strategy.md) | Prüfungen, Verantwortlichkeiten und CI-Lücken |
| [Testnachweise](testing/evidence.md) | Historische Ergebnisse und Vorlage für neue Läufe |
| [Betrieb](operations/deployment.md) | Deployment, Konfiguration und Grenzen |
| [Agentenrollen](agent-roles.md) | Rollen, Übergaben und Regeln gegen Wiederholungsschleifen |
| [Wiki-Entscheidung](decisions/llm-wiki.md) | Zweck und gewählte Umsetzung |

[Pflegeregeln](AGENTS.md) · [Aktualisierungslog](log.md) · [Benutzung](../README.md)
