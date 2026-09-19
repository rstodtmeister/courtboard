#!/usr/bin/env python3
"""Check the repository's Markdown knowledge structure without dependencies."""
from pathlib import Path
import re
import sys
import os
from urllib.parse import unquote


ROOT = Path(__file__).resolve().parents[1]
WIKI = ROOT / "knowledge/wiki"
LINK = re.compile(r"\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)")
SPECIAL = {"AGENTS.md", "index.md", "log.md"}
STATUSES = {"source-reviewed", "historical-report", "proposed", "needs-review"}


def exists_with_exact_case(path):
    """Reject links that work only on case-insensitive filesystems."""
    normalized = Path(os.path.normpath(path))
    if not normalized.is_relative_to(ROOT):
        return False
    current = ROOT
    for part in normalized.relative_to(ROOT).parts:
        if not current.is_dir() or part not in {p.name for p in current.iterdir()}:
            return False
        current = current / part
    return current.exists()


def check():
    errors = []
    pages = sorted(WIKI.rglob("*.md"))
    index = WIKI / "index.md"
    if not index.is_file():
        return ["knowledge/wiki/index.md fehlt"]
    indexed = set()
    for target in LINK.findall(index.read_text(encoding="utf-8")):
        if ":" not in target and not target.startswith("#"):
            indexed.add((index.parent / unquote(target.split("#")[0])).resolve())
    documents = pages + sorted((ROOT / "knowledge/raw").rglob("*.md"))
    documents += [ROOT / "AGENTS.md", ROOT / "knowledge/README.md"]
    for path in documents:
        if not path.is_file():
            errors.append(f"{path.relative_to(ROOT)} fehlt")
            continue
        content = path.read_text(encoding="utf-8")
        label = str(path.relative_to(ROOT))
        for target in LINK.findall(content):
            if ":" in target or target.startswith("#"):
                continue
            local = unquote(target.split("#")[0])
            if local and not exists_with_exact_case(path.parent / local):
                errors.append(f"{label}: Linkziel fehlt oder Groß-/Kleinschreibung stimmt nicht: {target}")
        if path in pages and path.name not in SPECIAL:
            header = re.match(r"\A---\n(.*?)\n---\n", content, re.S)
            metadata = dict(re.findall(r"^(\w+):\s*(.+)$", header[1], re.M)) if header else {}
            for field in ("title", "updated", "status", "source_commit"):
                if not metadata.get(field):
                    errors.append(f"{label}: Metadatum {field} fehlt")
            if metadata.get("status") not in STATUSES:
                errors.append(f"{label}: ungültiger Status")
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", metadata.get("updated", "")):
                errors.append(f"{label}: ungültiges Datumsformat")
            if not re.fullmatch(r"[0-9a-f]{40}", metadata.get("source_commit", "")):
                errors.append(f"{label}: vollständige Quellen-Commit-ID fehlt")
            for heading in ("## Quellen", "## Offene Punkte"):
                if heading not in content.splitlines():
                    errors.append(f"{label}: Abschnitt {heading} fehlt")
            if path.resolve() not in indexed:
                errors.append(f"{label}: nicht im Index verlinkt")
    return errors


if __name__ == "__main__":
    issues = check()
    if issues:
        print("\n".join(issues), file=sys.stderr)
        sys.exit(1)
    print("Wiki-Struktur geprüft: lokale Links, Index und Pflichtmetadaten gültig.")
