import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { protocolKind, protocolScoreLines, protocolValue, type ProtocolExport } from './gameProtocols';
import { downloadProtocolFile } from './dataApiProtocols';

export async function createProtocolPdf(value: ProtocolExport) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const width = 515;
  let page = doc.addPage([595, 842]);
  let y = 798;
  const clean = (text: string) => Array.from(text.normalize('NFC')).map(char => {
    try { font.encodeText(char); return char; } catch { return '?'; }
  }).join('');
  type Row = { text: string; size: number; heading: boolean };
  function rows(text: string, size = 9, heading = false): Row[] {
    const result: Row[] = [];
    const face = heading ? bold : font;
    let row = '';
    const flush = () => { if (row) result.push({ text: row, size, heading }); row = ''; };
    for (const word of clean(text).split(/\s+/)) {
      if (row && face.widthOfTextAtSize(`${row} ${word}`, size) > width) flush();
      if (face.widthOfTextAtSize(word, size) <= width) row += (row ? ' ' : '') + word;
      else for (const char of word) {
        if (face.widthOfTextAtSize(row + char, size) > width) flush();
        row += char;
      }
    }
    flush();
    return result;
  }
  function draw(row: Row) {
    if (y - row.size < 45) { page = doc.addPage([595, 842]); y = 798; }
    page.drawText(row.text, { x: 40, y, size: row.size, font: row.heading ? bold : font, color: rgb(.12, .16, .2) });
    y -= row.size + 3;
  }
  rows(`Spielprotokolle · ${value.tournament.name}`, 14, true).forEach(draw);
  rows(`Kurzfassung · Export ${value.exported_at}`, 8).forEach(draw);
  rows('AZ = Auszeit · K = Korrektur · Bestand = übernommener Verlauf. Vollständige Speicherungen: JSON-Export.', 8).forEach(draw);
  rows('Kein DVV-Spielbericht / unabhängiger Identitätsnachweis. Zeitangaben: Serverbestätigung (UTC), offline ggf. später.', 8).forEach(draw);
  y -= 8;
  for (const { protocol, events } of value.games) {
    const s = protocol.snapshot;
    const sets = [1, 2, 3].filter(set => [s[`set${set}_team_a`], s[`set${set}_team_b`]].some(v => v != null && v !== ''))
      .map(set => `S${set} ${protocolValue(s[`set${set}_team_a`])}:${protocolValue(s[`set${set}_team_b`])}`).join(' · ');
    const block = [
      ...rows(`#${protocolValue(s.number)} · ${protocolValue(s.team_a)} – ${protocolValue(s.team_b)}`, 10, true),
      ...rows(`C${protocolValue(s.court)} · ${protocolValue(s.result)}${sets ? ` (${sets})` : ''} · SR: ${protocolValue(s.referee)} · ${s.completed ? 'Abgeschlossen' : 'Offen'}${protocol.deleted ? ' · GELÖSCHT' : ''}`),
      ...rows([s.round && `Runde ${s.round}`, s.game_date, s.winner_team && `Sieger: ${s.winner_team}`, s.game_rating && `Wertung: ${s.game_rating}`, protocolKind(protocol)].filter(Boolean).join(' · '), 8),
    ];
    const scoreLines = protocolScoreLines(events);
    for (const line of scoreLines) {
      const text = line.items.map(item => item.text.replace(/↶/g, 'K zurück').replace(/↺/g, 'K')).join(' > ');
      block.push(...rows(`S${line.set}: ${text}`, 8));
    }
    if (!scoreLines.length) block.push(...rows('Kein aufgezeichneter Live-Punkteverlauf.', 8));
    block.push(...rows(`${events.length} Speicherungen · ${protocol.started_at ?? '–'} bis ${protocol.updated_at ?? '–'} · ID ${protocol.game_id}`, 7));
    const height = block.reduce((sum, row) => sum + row.size + 3, 0);
    // Keep ordinary games together; exceptionally long histories continue on another page.
    if (height <= 753 && y - height < 45) { page = doc.addPage([595, 842]); y = 798; }
    block.forEach(draw);
    y -= 10;
  }
  doc.getPages().forEach((sheet, index) => sheet.drawText(`Seite ${index + 1} / ${doc.getPageCount()}`, { x: 40, y: 22, size: 8, font }));
  return doc.save();
}
export async function downloadProtocolPdf(value: ProtocolExport) {
  const bytes = await createProtocolPdf(value);
  downloadProtocolFile(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), `spielprotokolle-kompakt-${value.tournament.id}-${value.exported_at.replace(/[^0-9]/g, "")}.pdf`);
}
