import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 let recording=null, saved;
 await page.route('https://example.supabase.co/functions/v1/youtube-recording',route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
  const body=route.request().postDataJSON();
  if(body.action==='save'){saved=body;recording={started_at:body.startedAt,offset_seconds:body.offsetSeconds,manual_start:!!body.startedAt};}
  return route.fulfill({headers:{'access-control-allow-origin':'*'},json:{recording,videoIds:['abcdefghijk','zyxwvutsrqp'],automaticAvailable:false}});
 });
 await page.goto('http://127.0.0.1:4175/tests/browser/youtube-settings.html');
 await page.getByText('Videozeit für Spielaufzeichnungen',{exact:true}).click();
 const start=page.getByLabel('Beginn der Aufzeichnung (Ortszeit dieses Geräts)');
 await start.fill('2026-01-01T09:00');
 await page.getByLabel('Zeitkorrektur in Sekunden').fill('25');
 await page.getByRole('button',{name:'Videozeit speichern'}).click();
 await page.getByText('Videozeit gespeichert.',{exact:true}).waitFor();
 assert.equal(saved.offsetSeconds,25);assert.equal(saved.videoId,'abcdefghijk');assert.ok(saved.startedAt.endsWith('Z'));
 assert.equal(await page.getByRole('button',{name:'Von YouTube abrufen'}).isDisabled(),true);
 assert.equal(await page.locator('select option').count(),2);
 assert.ok(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth));
 console.log('Passed: manual recording start, correction, archived videos, missing-key state, mobile width.');
}finally{await browser.close();}
