// Built cloud-mode preview only; intercepts every Supabase request with synthetic data.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true});
const context = await browser.newContext();
const game={id:'11111111-1111-4111-8111-111111111111',tournament_id:'22222222-2222-4222-8222-222222222222',number:'1',court:'1',team_a:'Alpha / Alice',team_b:'Beta / Bob',referee:'Ref / Ref2',game_rating:'Normal',set1_team_a:'0',set1_team_b:'0',set2_team_a:'',set2_team_b:'',set3_team_a:'',set3_team_b:'',point_history:'[]',completed:false,score_revision:0};
const entry={games:[game],allTeams:['Ref / Ref2'],link:{id:'link',game_id:game.id,court:null,expires_at:null,used_at:null}};
const commands=[];let rejectWrites=false;
await context.route('https://example.supabase.co/**',async route=>{
 const request=route.request(); const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'};
 if(request.method()==='OPTIONS')return route.fulfill({status:200,headers});
 if(request.method()==='GET')return route.fulfill({json:entry,headers});
 const body=request.postDataJSON();
 if(body.action)return route.fulfill({json:body.action==='sync-status'?{status:'not_configured'}:{ok:true},headers});
 commands.push(body);
 if(rejectWrites)return route.abort('failed');
 return route.fulfill({json:{ok:true,operationId:body.operationId,revision:body.baseRevision+1,completed:body.completed},headers});
});
try{
 const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto((process.env.SCORE_PREVIEW_URL||'http://127.0.0.1:4173/')+'?token=browser-test');
 await page.getByText('Wer pfeift?').waitFor();
 await page.evaluate(()=>navigator.serviceWorker.ready);
 const cacheFiles=await page.evaluate(async()=>{const cache=await caches.open((await caches.keys()).find(key=>key.startsWith('courtboard-score-')));return(await cache.keys()).map(r=>r.url)});
 assert.ok(cacheFiles.some(url=>url.includes('ScoreEntryApp')));assert.ok(!cacheFiles.some(url=>url.includes('pdfExport')||url.includes('AdminDashboard')));
 // Seed only the serve setup to exercise real point controls and browser persistence.
 await page.evaluate(id=>{
 const record=JSON.parse(localStorage.getItem('courtboard.outbox.v2.'+id));
 localStorage.setItem('courtboard.score-entry.browser-test',JSON.stringify({gameId:id,draft:record.acknowledged,workflowStep:'live',serverSetupStep:'side-change',activeSet:1,servingTeam:'A',firstServerTeamA:'Alpha',firstServerTeamB:'Beta',captainTeamA:'Alpha',captainTeamB:'Beta',sideChangeInterval:7,leftTeam:'A',setScore:{A:0,B:0},serverIndex:{A:0,B:0},serveCounts:{A:0,B:0},pointHistory:[]}));
 },game.id);
 await page.reload();await page.getByRole('button',{name:'Letzte Eingabe fortsetzen'}).click();
 const second=await context.newPage();await second.goto(page.url());await second.getByText(/bereits in einem anderen Tab/).waitFor();await second.close();
 await context.setOffline(true);
 await page.locator('.team-point-button').first().click();await page.locator('.team-point-button').first().click();
 await page.getByRole('button',{name:'Letzte Punkteingabe rückgängig'}).click();
 await page.getByText(/3 Eingabe\(n\) lokal gesichert/).waitFor();
 const before=await page.evaluate(id=>JSON.parse(localStorage.getItem('courtboard.outbox.v2.'+id)),game.id);
 assert.equal(before.pending.at(-1).draft.set1_team_a,'1');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Letzte Eingabe fortsetzen'}).click();
 assert.equal(await page.locator('.live-score').first().textContent(),'1');
 await context.setOffline(false);
 await page.getByText('Alle Eingaben vom Server bestätigt.').waitFor();
 const scores=commands.map(command=>command.set1TeamA);assert.deepEqual(scores,['1','2','1']);
 assert.deepEqual(commands.map(command=>command.baseRevision),[0,1,2]);
 // A final result stays pending through offline reload until its server receipt arrives.
 await page.evaluate(()=>localStorage.removeItem('courtboard.score-entry.browser-test'));
 await page.reload();
 await page.getByLabel('Schiedsgericht').selectOption('__no_referee__');
 await page.getByRole('button',{name:'Ergebnis eintragen',exact:true}).click();
 await page.getByText('Alle Eingaben vom Server bestätigt.').waitFor();
 const inputs=page.locator('.manual-result-table input');
 await inputs.nth(0).fill('21');await inputs.nth(1).fill('19');await inputs.nth(2).fill('21');await inputs.nth(3).fill('19');
 await context.setOffline(true);
 await page.getByRole('button',{name:'Ergebnis speichern',exact:true}).click();
 await page.getByText(/1 Eingabe\(n\) lokal gesichert/).waitFor();
 await page.reload({waitUntil:'domcontentloaded'});
 await page.getByText(/1 Eingabe\(n\) lokal gesichert/).waitFor();
 assert.equal(await page.locator('.score-form[inert]').count(),1);
 assert.equal(await page.getByRole('heading',{name:'Spiel abgeschlossen'}).count(),0);
 await context.setOffline(false);
 await page.getByText('Alle Eingaben vom Server bestätigt.').waitFor();
 await page.getByRole('heading',{name:'Spiel abgeschlossen'}).waitFor();
 assert.equal(commands.at(-1).completed,true);
 assert.equal(errors.length,0,errors.join('\n'));
 console.log(JSON.stringify({passed:true,checks:['exclusive scoring tab','offline point/point/undo','offline shell reload','restored visible score','ordered reconnect with revisions','no admin/PDF precache','offline final result confirmed only after reconnect'],commands:commands.length}));
}finally{await browser.close()}
