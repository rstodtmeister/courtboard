import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';

export type CourtQrEntry = { court: string; url: string };
export async function createCourtQrPdf(entries: CourtQrEntry[], title: string) {
  if (!entries.length) throw new Error('Keine Courts vorhanden.');
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const clean = (text: string) => Array.from(text).map(char => {
    try { font.encodeText(char); return char; } catch { return '?'; }
  }).join('');
  function centered(text: string, x: number, y: number, width: number, size: number, heading = false) {
    const face = heading ? bold : font;
    const value = clean(text);
    const fitted = Math.min(size, width / Math.max(1, face.widthOfTextAtSize(value, 1)));
    page.drawText(value, { x: x + (width - face.widthOfTextAtSize(value, fitted)) / 2, y, font: face, size: fitted });
  }
  centered(title, 30, 800, 535.28, 20, true);
  centered('QR-Code scannen und Court öffnen', 30, 778, 535.28, 10);
  const top = 753;
  const availableHeight = 708;
  const availableWidth = 535.28;
  let columns = 1;
  let bestSize = 0;
  for (let count = 1; count <= entries.length; count++) {
    const size = Math.min(availableWidth / count - 24, availableHeight / Math.ceil(entries.length / count) - 48);
    if (size > bestSize) { bestSize = size; columns = count; }
  }
  const rows = Math.ceil(entries.length / columns);
  const cellWidth = availableWidth / columns;
  const cellHeight = availableHeight / rows;
  const qrSize = Math.min(bestSize, 240);
  if (qrSize < 55) throw new Error('Zu viele Courts für gut lesbare QR-Codes auf einer A4-Seite.');
  entries.forEach((entry, index) => {
    const x = 30 + (index % columns) * cellWidth;
    const y = top - Math.floor(index / columns) * cellHeight;
    centered(`Court ${entry.court}`, x + 8, y - 20, cellWidth - 16, 17, true);
    const qr = QRCode.create(entry.url, { errorCorrectionLevel: 'M' });
    const modules = qr.modules.size;
    const scale = qrSize / (modules + 8); // Four white modules on every edge for reliable scanning.
    const left = x + (cellWidth - qrSize) / 2;
    const bottom = y - 30 - qrSize;
    for (let row = 0; row < modules; row++) for (let col = 0; col < modules; col++) {
      if (qr.modules.get(row, col)) page.drawRectangle({
        x: left + (col + 4) * scale,
        y: bottom + (modules + 3 - row) * scale,
        width: scale, height: scale, color: rgb(0, 0, 0),
      });
    }
  });
  return doc.save();
}
export async function downloadCourtQrPdf(entries: CourtQrEntry[], title: string) {
  const bytes = await createCourtQrPdf(entries, title);
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'qr-codes-courts.pdf';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
