# Wiki-Pflegeregeln

Diese Regeln ergänzen die [Projektanweisungen](../../AGENTS.md).
Vor Änderungen [Index](index.md), relevante Themenseiten und Originalquellen lesen.
Die Wiki ist abgeleitetes Wissen; bei Widersprüchen Code, Migrationen und Originalbelege prüfen.

- Bestehende Seiten thematisch ergänzen. Rohquellen bewahren und verlinken statt duplizieren.
- Themenseiten führen `title`, `updated`, `status` und vollständigen `source_commit`.
  Zulässige Statuswerte: `source-reviewed`, `historical-report`, `proposed`, `needs-review`.
  Der Quellen-Commit bezeichnet den gelesenen Repository-Stand, keinen Test- oder Deploymentnachweis.
- Implementiert, Test vorhanden, Test bestanden und produktiv geprüft getrennt darstellen.
  Historische Berichte mit Datum und Umgebung einordnen; sie sind kein aktueller Testlauf.
- Annahmen, Widersprüche und ungeprüfte Fälle als offene Punkte kennzeichnen.
  Produktionsstand nur mit datiertem Umgebungsnachweis behaupten.
- Keine Secrets, Live-Spieltoken oder sensiblen Live-Daten aufnehmen.
- Parallel schreibt nur der zugewiesene Wiki-Agent gemeinsame Seiten; Zuständigkeiten abstimmen.
- Jede Themenseite enthält Quellen und offene Punkte und ist im Index verlinkt.
  [Log](log.md) append-only ergänzen; frühere Ereignisse nicht umdeuten.
- Abschlussprüfung: `python3 scripts/check-knowledge.py`. Tatsächlichen Befehl,
  Ergebnis, Datum, Commit/Arbeitsbaum und Grenzen melden. Bloße Wiki-Pflege erfordert
  keine Anwendungstests oder Live-Aktionen.

Rollen und Übergaben stehen separat in [Agentenrollen](agent-roles.md).
