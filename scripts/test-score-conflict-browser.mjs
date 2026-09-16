import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true });
const message = 'Das Spiel wurde zwischenzeitlich geändert. Lokale Eingaben bleiben erhalten; bitte mit der Turnierleitung abgleichen.';
function game(score, revision) {
 const session = { version:1, workflowStep:'live',serverSetupStep:'serve-team',activeSet:1,servingTeam:'B',firstServerTeamA:'Alice',firstServerTeamB:'Ben',captainTeamA:'Alice',captainTeamB:'Ben',sideChangeInterval:7,leftTeam:'B',setScore:{A:score,B:6},serverIndex:{A:0,B:0},serveCounts:{A:4,B:3},correctionMode:false,sideChangeAck:14,timeoutScore:{A:null,B:null},activeTimeoutTeam:null,timeoutEndsAt:null,finalEditing:false,undo:[] };
 return {id:'conflict-game',tournament_id:'tournament',number:'1',court:'1',team_a:'Alice / Anna',team_b:'Ben / Bob',referee:'Ref',completed:false,printed:false,dirty:false,game_rating:'Normal',set1_team_a:String(score),set1_team_b:'6',set2_team_a:'',set2_team_b:'',set3_team_a:'',set3_team_b:'',point_history:'[]',score_entry_state:JSON.stringify(session),score_revision:revision};
}
const contextFor = game => ({link:{id:'link',tournament_id:'tournament',game_id:game.id,court:null,expires_at:null,used_at:null},games:[game],allTeams:[]});
try {
 for (const scenario of ['existing conflict', 'fresh conflict', 'temporary fetch failure']) {
  const context = await browser.newContext({viewport:{width:390,height:844}});
  const page = await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  let current=game(8,4), gets=0, rejectNext=false;
  const commands=[];
  if (scenario!=='fresh conflict') {
   current=game(9,8);
   const local=game(10,4);
   const record={version:2,token:'conflict-test',deviceId:'device',game:local,context:contextFor(local),revision:4,acknowledged:game(8,4),pending:[{id:'old-operation',draft:local}],blocked:message,updatedAt:1};
   await context.addInitScript(record=>localStorage.setItem('courtboard.outbox.v2.conflict-game',JSON.stringify(record)),record);
  }
  await page.route('https://example.supabase.co/functions/v1/submit-score**',async route=>{
   const request=route.request();const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'};
   if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
   if(request.method()==='GET') {
    gets++;
    if(scenario==='temporary fetch failure' && gets===1)return route.fulfill({status:503,headers,json:{error:'unavailable'}});
    return route.fulfill({headers,json:contextFor(current)});
   }
   const body=request.postDataJSON();
   if(body.action)return route.fulfill({headers,json:{ok:true,status:null}});
   commands.push(body);
   if(rejectNext){rejectNext=false;current=game(9,8);return route.fulfill({status:409,headers,json:{code:'revision_conflict',error:message}});}
   current={...current,score_revision:body.baseRevision+1,set1_team_a:body.set1TeamA,set1_team_b:body.set1TeamB,score_entry_state:body.scoreEntryState};
   return route.fulfill({headers,json:{ok:true,operationId:body.operationId,revision:current.score_revision,completed:body.completed}});
  });
  await page.goto('http://127.0.0.1:4175/tests/browser/score-conflict.html');
  if(scenario==='fresh conflict') {
   await page.getByRole('button',{name:'Letzte Eingabe fortsetzen'}).click();
   await page.waitForFunction(()=>{const r=JSON.parse(localStorage.getItem('courtboard.outbox.v2.conflict-game'));return r?.pending.length===0;});
   rejectNext=true;
   await page.locator('.team-point-button').first().click();
  }
  await page.waitForFunction(()=>{
   const r=JSON.parse(localStorage.getItem('courtboard.outbox.v2.conflict-game'));
   return r && !r.blocked && r.revision>=8 && r.acknowledged.set1_team_a==='9';
  });
  await page.locator('.team-point-button').first().waitFor();
  assert.deepEqual(await page.locator('.live-score').allTextContents(),['6','9']);
  assert.equal(await page.getByRole('button',{name:/Sicherung herunterladen|Mit Serverstand abgleichen|Serverstand übernehmen|Letzte Eingabe fortsetzen/}).count(),0);
  assert.equal(await page.getByText(message,{exact:true}).count(),0);
  assert.equal(await page.locator('.score-sync-notice').count(),0);
  assert.equal(await page.locator('.active-server').first().textContent().then(t=>t.includes('Ben')),true);
  await page.locator('.team-point-button').first().click();
  await page.waitForFunction(()=>{const r=JSON.parse(localStorage.getItem('courtboard.outbox.v2.conflict-game'));return !r.blocked && r.pending.length===0 && r.acknowledged.set1_team_b==='7';});
  assert.ok(commands.some(command=>command.baseRevision>=8 && command.set1TeamA==='9' && command.set1TeamB==='7'));
  assert.deepEqual(errors,[]);
  console.log(`Passed: ${scenario}, automatic server state, service order and next point; no reconciliation UI.`);
  await context.close();
 }
} finally {await browser.close();}
