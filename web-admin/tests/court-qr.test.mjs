import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import { PDFDocument } from 'pdf-lib';
const require=createRequire(import.meta.url);
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const url=source=>'data:text/javascript;base64,'+Buffer.from(compile(source)).toString('base64');
const {courtQrTokens,findCourtScoreLink}=await import(url(await read('../src/courtScoreLinks.ts')));
const link=(court,token,extra={})=>({id:`link-${token}`,tournament_id:'t',court,token,game_id:null,disabled_at:null,expires_at:null,...extra});

test('reuse only valid referee links belonging to the tournament and entire court',async()=>{
 const courts=[{court:'1',tournamentId:'t'},{court:'2',tournamentId:'t'}];
 const links=[link('1','wrong-tournament',{tournament_id:'other'}),link('1','game-only',{game_id:'game'}),link('1','expired',{expires_at:'2000-01-01'}),link('1','disabled',{disabled_at:'2026-01-01'}),link('1','referee-1'),link('2','referee-2')];
 assert.equal(findCourtScoreLink(links,courts[0]).token,'referee-1');
 const entries=await courtQrTokens(courts,links,()=>{throw Error('Existing link must not be replaced')});
 assert.deepEqual(entries,[{court:'1',token:'referee-1'},{court:'2',token:'referee-2'}]);
});
test('generate missing links and stop a failed print instead of returning a partial PDF',async()=>{
 const calls=[];const courts=[{court:'1',tournamentId:'t'},{court:'2',tournamentId:'t'}];
 const entries=await courtQrTokens(courts,[link('1',null),link('2','expired',{expires_at:'2000-01-01'})],async(court,tournament)=>{calls.push([court,tournament]);return `created-${court}`});
 assert.deepEqual(calls,[['1','t'],['2','t']]);assert.deepEqual(entries.map(e=>e.token),['created-1','created-2']);
 await assert.rejects(courtQrTokens(courts,[],async()=>null),/Court 1/);
});
test('the print button encodes referee token URLs in a single A4 PDF',async()=>{
 const encoded=[];let pdfBytes,printedTitle,printError='';
 globalThis.__courtQrTest={capture:value=>encoded.push(value)};
 const qrUrl=url(`import QRCode from ${JSON.stringify(pathToFileURL(require.resolve('qrcode')).href)}; export default {create(value,options){globalThis.__courtQrTest.capture(value);return QRCode.create(value,options)}};`);
 const pdfSource=(await read('../src/courtQrPdf.ts')).replace("'pdf-lib'",JSON.stringify(pathToFileURL(require.resolve('pdf-lib')).href)).replace("'qrcode'",JSON.stringify(qrUrl));
 const {createCourtQrPdf}=await import(url(pdfSource));
 globalThis.__courtQrTest.download=async(entries,title)=>{printedTitle=title;pdfBytes=await createCourtQrPdf(entries,title)};
 const downloadUrl=url('export const downloadCourtQrPdf=(entries,title)=>globalThis.__courtQrTest.download(entries,title);');
 const shared=await read('../src/admin/shared.tsx');
 const scoreUrlSource=shared.slice(shared.indexOf('export function scoreUrl('),shared.indexOf('export function loginUrl(')).replace('export function','function');
 const scoreUrl=new Function('window',compile(scoreUrlSource)+';return scoreUrl;')({location:{href:'https://example.test/courtboard/?view=admin#courts'}});
 const panel=await read('../src/admin/CourtLinksPanel.tsx');
 const handler=panel.slice(panel.indexOf('  async function printCourtQrCodes()'),panel.indexOf('  const sortedGames')).replace('"../courtQrPdf"',JSON.stringify(downloadUrl));
 const context={courtQrTokens,scoreUrl,courts:[{court:'1',tournamentId:'t'},{court:'2',tournamentId:'t'}],links:[link('1','existing-token')],onCreateCourtLink:async()=> 'new-token',setPrintingQr:()=>{},setQrError:value=>{printError=value}};
 await new Function(...Object.keys(context),compile(handler)+';return printCourtQrCodes;')(...Object.values(context))();
 assert.equal(printError,'');assert.match(printedTitle,/Schiedsrichter/);
 assert.deepEqual(encoded,['https://example.test/courtboard/?token=existing-token','https://example.test/courtboard/?token=new-token']);
 const pdf=await PDFDocument.load(pdfBytes);assert.equal(pdf.getPageCount(),1);
 const {width,height}=pdf.getPage(0).getSize();assert.equal(width,595.28);assert.equal(height,841.89);
 delete globalThis.__courtQrTest;
});
