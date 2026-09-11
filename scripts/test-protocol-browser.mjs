import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true});const context=await browser.newContext({acceptDownloads:true});
const base={tournament_id:'t',started_at:'2026-09-11T10:00:00Z',updated_at:'2026-09-11T10:01:00Z',event_count:105,has_live:false,has_result_entry:false,has_admin_changes:false,baseline_has_score:false,deleted:false};
const protocols=[{...base,game_id:'g1',snapshot:{number:'1',court:'1',team_a:'Alpha',team_b:'Beta',referee:'Ref',completed:true,result:'2:0'},has_live:true},
 {...base,game_id:'g2',snapshot:{number:'2',court:'2',team_a:'Gamma',team_b:'Delta',completed:true,result:'0:2'},has_admin_changes:true}];
const events=Array.from({length:105},(_,i)=>({id:i+1,game_id:'g1',recorded_at:'2026-09-11T10:01:00Z',source:i?'admin':'system',actor_label:i?'admin@example.invalid':null,action:i?'updated':'created',snapshot:i?null:protocols[0].snapshot,changes:i?{set1_team_a:{before:i-1,after:i}}:{},history_change:null}));
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
 const jsonDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Spiel als JSON'}).click();const json=JSON.parse(await readFile(await(await jsonDownload).path(),'utf8'));
 assert.equal(json.games[0].events.length,105);assert.equal(json.games[0].protocol.snapshot.set1_team_a,104);
 const pdfDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Spiel als PDF'}).click();const pdf=await readFile(await(await pdfDownload).path());assert.equal(pdf.subarray(0,4).toString(),'%PDF');
 await page.getByRole('button',{name:'Alle Spielprotokolle',exact:false}).click();await page.getByLabel('Erfassung',{exact:true}).selectOption('Admin-Eingabe');assert.equal(await page.getByRole('button',{name:'Protokoll Spiel 2 öffnen'}).count(),1);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth),'Mobile page overflow');
 const openBox=await page.getByRole('button',{name:'Protokoll Spiel 2 öffnen'}).boundingBox();assert.ok(openBox.x+openBox.width<=390,'Open action must be visible without horizontal scrolling');
 await page.screenshot({path:'/private/tmp/courtboard-protocol-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks:['separate admin navigation','lazy history loading','court/source filters','105 events without truncation','JSON download','PDF download','mobile width']}));
}finally{await browser.close()}
