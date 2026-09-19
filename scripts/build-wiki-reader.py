#!/usr/bin/env python3
"""Build an offline reading view from the repository wiki (no dependencies)."""
from pathlib import Path
import html
import json
import re
from urllib.parse import quote, unquote

ROOT = Path(__file__).resolve().parents[1]
WIKI = ROOT / "knowledge/wiki"
OUTPUT = ROOT / "knowledge/reading.html"


def page_id(path):
    return path.relative_to(WIKI).as_posix()


def inline(value, source):
    # Escape all source text; only supported Markdown creates HTML.
    parts = re.split(r"(`[^`]+`|\[[^\]]+\]\([^\s)]+\))", value)
    result = []
    for part in parts:
        if part.startswith("`") and part.endswith("`"):
            result.append("<code>" + html.escape(part[1:-1]) + "</code>")
            continue
        link = re.fullmatch(r"\[([^\]]+)\]\(([^\s)]+)\)", part)
        if link:
            label, target = link.groups()
            if target.startswith(("https://", "http://")):
                href = target
            elif ":" in target or target.startswith("#"):
                result.append(html.escape(label))
                continue
            else:
                local = (source.parent / unquote(target.split("#")[0])).resolve()
                if local.is_relative_to(WIKI) and local.suffix == ".md":
                    href = "#" + quote(page_id(local), safe="/")
                elif local.is_relative_to(ROOT):
                    href = quote("../" + local.relative_to(ROOT).as_posix(), safe="/")
                else:
                    result.append(html.escape(label))
                    continue
            result.append('<a href="' + html.escape(href, quote=True) + '">' + html.escape(label) + "</a>")
        else:
            escaped = html.escape(part)
            escaped = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", escaped)
            result.append(escaped)
    return "".join(result)


def render(text, source):
    """Render the wiki's headings, paragraphs, lists, tables and code fences."""
    lines = text.splitlines()
    out = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if line.startswith("```"):
            block = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                block.append(lines[i])
                i += 1
            out.append("<pre><code>" + html.escape("\n".join(block)) + "</code></pre>")
            i += 1
            continue
        heading = re.match(r"^(#{1,6})\s+(.+)$", line)
        if heading:
            level = len(heading[1])
            out.append(f"<h{level}>" + inline(heading[2], source) + f"</h{level}>")
            i += 1
            continue
        if line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                cells = [cell.strip() for cell in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-+:?", cell) for cell in cells):
                    rows.append(cells)
                i += 1
            out.append('<div class="table-wrap"><table>')
            for n, row in enumerate(rows):
                tag = "th" if n == 0 else "td"
                out.append("<tr>" + "".join(f"<{tag}>" + inline(cell, source) + f"</{tag}>" for cell in row) + "</tr>")
            out.append("</table></div>")
            continue
        if line.startswith("- "):
            out.append("<ul>")
            while i < len(lines) and lines[i].startswith("- "):
                item = lines[i][2:]
                i += 1
                while i < len(lines) and lines[i].startswith("  "):
                    item += " " + lines[i].strip()
                    i += 1
                out.append("<li>" + inline(item, source) + "</li>")
            out.append("</ul>")
            continue
        paragraph = [line]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r"^(#|\||- |```)", lines[i]):
            paragraph.append(lines[i])
            i += 1
        out.append("<p>" + inline(" ".join(paragraph), source) + "</p>")
    return "\n".join(out)


def collect():
    index = WIKI / "index.md"
    ordered = [index]
    for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", index.read_text()):
        path = (WIKI / target).resolve()
        if path.is_relative_to(WIKI) and path.is_file() and path.suffix == ".md" and path not in ordered:
            ordered.append(path)
    ordered += [p for p in sorted(WIKI.rglob("*.md")) if p not in ordered]
    pages = []
    for path in ordered:
        text = path.read_text(encoding="utf-8")
        meta = {}
        header = re.match(r"\A---\n(.*?)\n---\n", text, re.S)
        if header:
            meta = dict(re.findall(r"^(\w+):\s*(.+)$", header[1], re.M))
            text = text[header.end():]
        title = re.search(r"^# (.+)$", text, re.M)
        pages.append(dict(id=page_id(path), title=title[1] if title else path.stem,
                          body=render(text, path), search=text.lower(), meta=meta))
    return pages


TEMPLATE = '''<!doctype html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CourtBoard · Wissen</title>
<style>
:root{color-scheme:light;--bg:#f5f4ef;--paper:#fff;--text:#25332e;--muted:#68766e;--line:#dbe2da;--accent:#15664e}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:17px/1.7 system-ui,sans-serif}
a{color:var(--accent);text-underline-offset:3px}button,input{font:inherit}button{cursor:pointer}
.shell{display:grid;grid-template-columns:290px minmax(0,1fr);min-height:100vh}
aside{position:sticky;top:0;height:100vh;overflow:auto;padding:30px 22px;border-right:1px solid var(--line)}
.brand{font-size:24px;font-weight:750;letter-spacing:-1px}.brand small{display:block;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:var(--muted)}
label{display:block;margin:26px 0 6px;font-size:13px;font-weight:650}input{width:100%;border:1px solid var(--line);border-radius:9px;padding:9px 12px;background:var(--paper);color:var(--text)}
nav{margin:22px 0}nav a{display:block;padding:8px 12px;margin:3px 0;border-radius:7px;text-decoration:none;font-size:14px;line-height:1.5;color:var(--text)}nav a.active{background:#dfede5;color:#134b39;font-weight:700}nav a:hover{background:#e9eee8}
.hint{font-size:12px;color:var(--muted)}main{padding:34px clamp(20px,5vw,80px) 80px;min-width:0}
.toolbar{display:flex;justify-content:space-between;align-items:center;gap:15px;margin-bottom:24px;font-size:13px;color:var(--muted)}button{background:var(--paper);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:6px 12px}
article{max-width:1000px;margin:auto;background:var(--paper);padding:clamp(22px,4vw,55px);border:1px solid var(--line);border-radius:14px}
h1{font-size:clamp(28px,3vw,40px);line-height:1.2;letter-spacing:-1px;margin:0 0 28px}h2{font-size:23px;line-height:1.35;margin:38px 0 15px}h3{font-size:19px}p{margin:0 0 20px}li{margin:8px 0}code{font-size:.85em;background:var(--bg);padding:2px 5px;border-radius:4px;overflow-wrap:anywhere}pre{overflow:auto}
.table-wrap{overflow:auto;margin:22px 0}table{border-collapse:collapse;width:100%;font-size:14px;line-height:1.6}th,td{text-align:left;vertical-align:top;padding:12px 14px;border-bottom:1px solid var(--line)}th{background:var(--bg);font-weight:650}td code{word-break:break-word}
.metadata{margin:0 0 30px;padding:12px 15px;border-left:3px solid var(--accent);background:var(--bg);font-size:13px;color:var(--muted)}.metadata code{padding:0}.source{font-size:13px;margin-top:35px;padding-top:18px;border-top:1px solid var(--line)}.hidden{display:none}
a:focus-visible,button:focus-visible,input:focus-visible{outline:3px solid #d2a62f;outline-offset:3px}
@media(max-width:800px){.shell{display:block}aside{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line);padding:20px}nav{display:flex;flex-wrap:wrap;margin:12px 0}nav a{font-size:13px;padding:6px 9px}label{margin-top:14px}main{padding:20px 12px 45px}.toolbar{padding:0 8px}article{border-radius:9px}}
@media print{aside,.toolbar,.source{display:none}.shell{display:block}main{padding:0}article{border:0;padding:0;max-width:none}body{font-size:11pt;background:white}h2,h3{break-after:avoid}tr{break-inside:avoid}a{color:inherit}.table-wrap{overflow:visible}}
</style></head>
<body><div class="shell"><aside><div class="brand">CourtBoard<small>Projektwissen</small></div>
<label for="search">Wiki durchsuchen</label><input id="search" type="search" placeholder="Thema oder Begriff …">
<p id="count" class="hint" role="status" aria-live="polite"></p><nav id="navigation" aria-label="Wiki-Themen"></nav>
<p class="hint">Lokale Leseansicht aus den Wiki-Dateien. Quellenstand und Testgrenzen stehen auf den jeweiligen Seiten.</p></aside>
<main><div class="toolbar"><span id="position"></span><button id="print" type="button">Drucken / PDF</button></div><article id="content"></article></main></div>
<script id="wiki-data" type="application/json">__PAGES__</script>
<script>
const pages=JSON.parse(document.getElementById('wiki-data').textContent);
const nav=document.getElementById('navigation'),content=document.getElementById('content');
const statusNames={'source-reviewed':'Quellen geprüft','historical-report':'Historischer Bericht','proposed':'Vorschlag','needs-review':'Prüfung offen'};
function currentId(){try{return decodeURIComponent(location.hash.slice(1))||'index.md'}catch{return 'index.md'}}
function navigate(){const page=pages.find(p=>p.id===currentId())||pages[0];content.innerHTML=page.body;
 const meta=page.meta;if(meta.updated){const box=document.createElement('div');box.className='metadata';box.textContent=`Stand: ${meta.updated} · ${statusNames[meta.status]||meta.status} · Quellen-Commit: ${(meta.source_commit||'').slice(0,7)}. Dies ist kein aktueller Test- oder Produktionsnachweis.`;content.querySelector('h1')?.after(box)}
 const footer=document.createElement('p');footer.className='source';const link=document.createElement('a');link.href='wiki/'+page.id;link.textContent='Markdown-Quelle öffnen';footer.append(link);content.append(footer);
 document.title=page.title+' · CourtBoard';document.getElementById('position').textContent='Wissen / '+page.title;
 for(const a of nav.querySelectorAll('a')){const active=a.dataset.id===page.id;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')}
}
function filter(){const query=document.getElementById('search').value.toLocaleLowerCase('de').trim();let count=0;nav.replaceChildren();
 for(const page of pages){if(query&&!page.search.includes(query)&&!page.title.toLocaleLowerCase('de').includes(query))continue;count++;const a=document.createElement('a');a.href='#'+encodeURI(page.id);a.dataset.id=page.id;a.textContent=page.title;nav.append(a)}
 document.getElementById('count').textContent=query?`${count} passende Themen`:`${count} Seiten`;navigate();}
document.getElementById('search').addEventListener('input',filter);document.getElementById('print').addEventListener('click',()=>window.print());
window.addEventListener('hashchange',()=>{navigate();window.scrollTo(0,0)});filter();
</script></body></html>
'''


if __name__ == "__main__":
    pages = collect()
    # Prevent source text from ending the embedded JSON script element.
    data = json.dumps(pages, ensure_ascii=False).replace("<", "\\u003c")
    OUTPUT.write_text(TEMPLATE.replace("__PAGES__", data), encoding="utf-8")
    print(f"Leseansicht erstellt: {OUTPUT.relative_to(ROOT)} ({len(pages)} Seiten)")
