import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const url=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const modelUrl=url(await readFile(new URL('../src/gameProtocols.ts',import.meta.url),'utf8'));
const {protocolKind,historyDescription}=await import(modelUrl);
const base={game_id:'g',tournament_id:'t',snapshot:{number:'1',team_a:'Änne / Alice',team_b:'Bob / 李',result:'2:0'},has_live:false,has_admin_changes:false,has_result_entry:false,baseline_has_score:false};
test('labels distinguish imported, result-only, admin and partial live histories',()=>{
 assert.equal(protocolKind({...base,baseline_has_score:true}),'Übernommener Stand');
 assert.equal(protocolKind({...base,has_result_entry:true}),'Nur Ergebnis');
 assert.equal(protocolKind({...base,has_admin_changes:true}),'Admin-Eingabe');
 assert.equal(protocolKind({...base,has_live:true}),'Live-Erfassung');
 assert.equal(protocolKind({...base,has_live:true,has_result_entry:true}),'Teilweise live');
 assert.equal(protocolKind({...base,has_live:true,has_admin_changes:true}),'Teilweise live');
});
test('history describes actual appended timeouts and corrections without claiming a complete legacy history',()=>{
 assert.match(historyDescription({history_change:{replace:[]}})[0],/kein Beleg/);
 assert.match(historyDescription({history_change:{keep:119,drop:1,append:[{set:2,team:'B',scoreA:10,scoreB:8,type:'timeout'}]}}).join('\n'),/Auszeit B, Stand 10:8/);
});
test('export paginates past API limits and fixes its snapshot at an event boundary',async()=>{
 const rows=Array.from({length:205},(_,i)=>({id:i+1,game_id:'g',recorded_at:'2026-09-11T10:00:00Z',source:'admin',action:i===0?'created':'updated',snapshot:i===0?base.snapshot:null,changes:{set1_team_a:{before:String(i),after:String(i+1)}},history_change:null}));
 const calls=[];let revoked=false;
 globalThis.__protocolDb={from:table=>{
  const args={table};const q={select:fields=>{args.fields=fields;return q},eq:()=>q,gt:(_,value)=>{args.after=value;return q},lte:(_,value)=>{args.through=value;return q},order:(_,opts)=>{args.desc=opts?.ascending===false;return q},limit:value=>{args.limit=value;return q},then:resolve=>{
   calls.push(args);return Promise.resolve({data:args.desc?[{id:205}]:revoked?[]:rows.filter(r=>r.id>args.after&&r.id<=args.through).slice(0,args.limit),error:null}).then(resolve);
  }};return q;
 }};
 const coreUrl=url('export const dataMode="supabase";export const getSupabase=()=>globalThis.__protocolDb;');
 const code=(await readFile(new URL('../src/dataApiProtocols.ts',import.meta.url),'utf8')).replace("'./dataApiCore'",JSON.stringify(coreUrl));
 const {exportGameProtocols}=await import(url(code));
 const result=await exportGameProtocols({id:'t',name:'Test'},[{...base,event_count:1}]);
 assert.equal(result.games[0].events.length,205);assert.equal(result.games[0].protocol.snapshot.set1_team_a,'205');assert.equal(result.games[0].protocol.event_count,205);
 assert.equal(calls.length,4);assert.ok(calls.slice(1).every(call=>call.through===205));
 revoked=true;await assert.rejects(exportGameProtocols({id:'t',name:'Test'},[base]),/vollständig/);
});
test('PDF includes long protocols on multiple valid pages and accepts non-Latin team names',async()=>{
 const pdfUrl=pathToFileURL(require.resolve('pdf-lib')).href;
 const source=(await readFile(new URL('../src/protocolPdf.ts',import.meta.url),'utf8')).replace("'pdf-lib'",JSON.stringify(pdfUrl)).replace("'./gameProtocols'",JSON.stringify(modelUrl)).replace("'./dataApiProtocols'",JSON.stringify(url('export const downloadProtocolFile=()=>{};')));
 const {createProtocolPdf}=await import(url(source));const {PDFDocument}=await import('pdf-lib');
 const events=Array.from({length:150},(_,i)=>({recorded_at:'2026-09-11T10:00:00Z',source:'admin',action:'updated',actor_label:'Tester',changes:{set1_team_a:{before:i,after:i+1}},history_change:null}));
 const bytes=await createProtocolPdf({tournament:{name:'Testturnier'},exported_at:'2026-09-11',games:[{protocol:base,events}]});
 const document=await PDFDocument.load(bytes);assert.ok(document.getPageCount()>3);
});
