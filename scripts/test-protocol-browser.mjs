import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../web-admin/package.json', import.meta.url));
const { PDFDocument } = require('pdf-lib');
import { readFile } from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true});const context=await browser.newContext({acceptDownloads:true});
const base={tournament_id:'t',started_at:'2026-09-11T10:00:00Z',updated_at:'2026-09-11T10:01:00Z',event_count:105,has_live:false,has_result_entry:false,has_admin_changes:false,baseline_has_score:false,deleted:false};
const protocols=[{...base,game_id:'g1',snapshot:{number:'1',court:'1',team_a:'Alpha',team_b:'Beta',referee:'Ref',completed:true,result:'2:0'},has_live:true},
 {...base,game_id:'g2',snapshot:{number:'2',court:'2',team_a:'Gamma',team_b:'Delta',completed:true,result:'0:2'},has_admin_changes:true}];
const events=Array.from({length:105},(_,i)=>({id:i+1,game_id:'g1',recorded_at:'2026-09-11T10:01:00Z',source:i===0?'system':i<=90?'referee':'admin',actor_label:i?'admin@example.invalid':null,action:i?'updated':'created',snapshot:i?null:{...protocols[0].snapshot,set1_team_a:'0',set1_team_b:'0'},changes:i?{set1_team_a:{before:i-1,after:i}}:{},history_change:i>0&&i<=90?{drop:0,keep:i-1,append:[{set:1,team:'A',scoreA:i,scoreB:0}]}:null}));
const tournament={id:'t',name:'Browser-Testturnier',hvv_edit_url:'',hvv_public_url:null,token_base_url:null,courts:['1','2'],court_streams:{}};
const calls=[];
await context.route('https://example.supabase.co/**',async route=>{
 const url=new URL(route.request().url());calls.push(url.pathname);
 const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'};
 if(route.request().method()==='OPTIONS')return route.fulfill({status:200,headers});
 if(url.pathname.endsWith('/tournaments'))return route.fulfill({json:url.searchParams.has('id')?tournament:[tournament],headers});
 if(['/games','/score_entry_links','/score_court_locks'].some(path=>url.pathname.endsWith(path)))return route.fulfill({json:[],headers});
 if(url.pathname.endsWith('/game_protocols'))return route.fulfill({json:protocols,headers});
 if(url.pathname.endsWith('/game_protocol_events')){
  if(url.searchParams.get('order')==='id.desc')return route.fulfill({json:[{id:105}],headers});
  const after=Number((url.searchParams.getAll('id').find(v=>v.startsWith('gt.'))??'gt.0').slice(3));
  return route.fulfill({json:events.filter(e=>e.id>after).slice(0,100),headers});
 }
 throw Error('Unexpected backend request');
});
try{
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.PROTOCOL_PREVIEW_URL||'http://127.0.0.1:4174/tests/browser/protocols.html');
 await page.getByRole('button',{name:'Spielprotokolle',exact:true}).click();
 await page.getByRole('button',{name:'Protokoll Spiel 1 öffnen'}).waitFor();
 assert.equal(calls.some(path=>path.endsWith('game_protocol_events')),false,'List must not fetch any history');
 await page.getByLabel('Court',{exact:true}).selectOption('2');assert.equal(await page.getByRole('button',{name:'Protokoll Spiel 1 öffnen'}).count(),0);
 await page.getByLabel('Court',{exact:true}).selectOption('');
 await page.getByRole('button',{name:'Protokoll Spiel 1 öffnen'}).click();
 await page.getByRole('button',{name:'Weitere Einträge laden'}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.protocol-events > li').length===105);
 assert.equal(await page.locator('.protocol-audit-details[open]').count(),0,'Full audit stays collapsed');
 assert.equal(await page.getByLabel('Punkteverlauf Satz 1').count(),1);
 assert.equal(await page.getByLabel('Punkteverlauf Satz 1').evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap');
 await page.locator('.protocol-audit-details > summary').click();
 assert.equal(await page.locator('.protocol-event > details[open]').count(),0,'Event details start collapsed');
 await page.locator('.protocol-event-summary').nth(1).click();assert.equal(await page.locator('.protocol-event > details[open]').count(),1);
 await page.locator('.protocol-event-summary').nth(1).click();
 await page.locator('.protocol-audit-details > summary').click();
 await page.screenshot({path:'/private/tmp/courtboard-compact-protocol-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth),'Mobile detail page overflow');
 assert.ok(await page.getByLabel('Punkteverlauf Satz 1').evaluate(el=>el.scrollWidth>el.clientWidth),'Long score line scrolls within its track');
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'/private/tmp/courtboard-compact-protocol-mobile.png'});
 await page.setViewportSize({width:1280,height:720});
 const jsonDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Spiel als JSON'}).click();const json=JSON.parse(await readFile(await(await jsonDownload).path(),'utf8'));
 assert.equal(json.games[0].events.length,105);assert.equal(json.games[0].protocol.snapshot.set1_team_a,104);
 const pdfDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Spiel als PDF'}).click();const downloadedPdf=await pdfDownload;assert.match(downloadedPdf.suggestedFilename(),/^spielprotokolle-kompakt-/);const pdf=await readFile(await downloadedPdf.path());assert.equal(pdf.subarray(0,4).toString(),'%PDF');assert.equal((await PDFDocument.load(pdf)).getPageCount(),1,'90 point scores must fit on one compact PDF page');
 await page.getByRole('button',{name:'Alle Spielprotokolle',exact:false}).click();await page.getByLabel('Erfassung',{exact:true}).selectOption('Admin-Eingabe');assert.equal(await page.getByRole('button',{name:'Protokoll Spiel 2 öffnen'}).count(),1);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth),'Mobile page overflow');
 const openBox=await page.getByRole('button',{name:'Protokoll Spiel 2 öffnen'}).boundingBox();assert.ok(openBox.x+openBox.width<=390,'Open action must be visible without horizontal scrolling');
 await page.screenshot({path:'/private/tmp/courtboard-protocol-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks:['separate admin navigation','lazy history loading','court/source filters','105 events without truncation','JSON download','PDF download','mobile width']}));
}finally{await browser.close()}
