import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const localChrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath=process.env.CHROMIUM_EXECUTABLE_PATH||(existsSync(localChrome)?localChrome:undefined);
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
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
 await page.getByRole('heading',{name:'Aufzeichnungsbeginn einrichten'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Von YouTube übernehmen'}).isDisabled(),true);
 const before=Date.now();
 await page.getByRole('button',{name:'Jetzt als Beginn speichern'}).click();
 await page.getByRole('heading',{name:'Aufzeichnung eingerichtet'}).waitFor();
 assert.ok(Date.parse(saved.startedAt)>=before&&Date.parse(saved.startedAt)<=Date.now());
 assert.equal(saved.offsetSeconds,0);assert.equal(saved.videoId,'abcdefghijk');
 assert.equal(await page.getByText('Manuell festgelegt',{exact:true}).isVisible(),true);

 await page.getByRole('button',{name:'Einstellung ändern'}).click();
 assert.equal(await page.locator('select option').count(),2);
 const start=page.getByLabel('Datum und Uhrzeit');
 await start.fill('2026-01-01T09:00');
 await page.getByText('Feineinstellung',{exact:true}).click();
 await page.getByLabel('Video-Versatz in Sekunden').fill('20');
 await page.getByRole('button',{name:'Video-Versatz um 5 Sekunden erhöhen'}).click();
 await page.getByRole('button',{name:'Änderungen speichern'}).click();
 await page.getByText('Aufzeichnungsbeginn gespeichert.',{exact:true}).waitFor();
 assert.equal(saved.offsetSeconds,25);assert.equal(saved.videoId,'abcdefghijk');assert.ok(saved.startedAt.endsWith('Z'));
 assert.ok(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth));
 console.log('Passed: one-tap setup, compact status, manual edit, correction, archived videos and mobile width.');
}finally{await browser.close();}
