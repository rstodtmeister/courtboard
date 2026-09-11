import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { historyDescription, protocolFieldLabels, protocolKind, protocolSourceLabels, protocolValue, type ProtocolExport } from './gameProtocols';
import { downloadProtocolFile } from './dataApiProtocols';
export async function createProtocolPdf(value: ProtocolExport) {
  const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.Helvetica);
  let page=doc.addPage([595,842]);let y=798;
  const clean=(text:string)=>Array.from(text.normalize('NFC')).map(char=>{try{font.encodeText(char);return char}catch{return '?'}}).join('');
  function line(text:string, size=10) {
    const words=clean(text).split(/\s+/);let row='';
    function draw() {if(y<45){page=doc.addPage([595,842]);y=798}page.drawText(row,{x:40,y,size,font,color:rgb(.12,.16,.2)});y-=size+5;row=''}
    for(const word of words){for(const piece of word.match(/.{1,70}/g)??['']){if(row && font.widthOfTextAtSize(row+' '+piece,size)>515)draw();row+=(row?' ':'')+piece}}
    if(row)draw();
  }
  value.games.forEach(({protocol,events},index)=>{
    if(index){page=doc.addPage([595,842]);y=798}
    line(`Spielprotokoll ${protocol.snapshot.number ?? ''}`,18);line(value.tournament.name,12);
    line(`Erstellt: ${value.exported_at} · ${protocolKind(protocol)}${protocol.deleted?' · Spiel gelöscht':''}`);
    line('Zeitangaben: Serverbestätigung (UTC). Offline-Eingaben können später bestätigt sein.');
    line('Aufgezeichnete Speicherung; kein DVV-Spielbericht und kein unabhängiger Identitätsnachweis.');
    for(const [field,v] of Object.entries(protocol.snapshot))line(`${protocolFieldLabels[field]??field}: ${protocolValue(v)}`);
    y-=10;
    for(const event of events){
      line(`${event.recorded_at} · ${protocolSourceLabels[event.source]}${event.source==='admin'?` · ${event.actor_label??event.actor_id??'Unbekannt'}`:''} · ${event.action==='deleted'?'Spiel gelöscht':event.action==='baseline'?'Ausgangsstand':event.action==='created'?'Spiel angelegt':'Änderung'}`,11);
      if(event.snapshot)for(const [field,v] of Object.entries(event.snapshot))line(`${protocolFieldLabels[field]??field}: ${protocolValue(v)}`);
      for(const [field,change] of Object.entries(event.changes))line(`${protocolFieldLabels[field]??field}: ${protocolValue(change.before)} -> ${protocolValue(change.after)}`);
      for(const text of historyDescription(event))line(text);
      y-=8;
    }
  });
  doc.getPages().forEach((sheet,index)=>sheet.drawText(`Seite ${index+1} / ${doc.getPageCount()}`,{x:40,y:22,size:8,font}));
  return doc.save();
}
export async function downloadProtocolPdf(value: ProtocolExport) {
  const bytes=await createProtocolPdf(value);
  downloadProtocolFile(new Blob([new Uint8Array(bytes)],{type:'application/pdf'}),`spielprotokolle-${value.tournament.id}.pdf`);
}
