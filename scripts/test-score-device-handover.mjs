// Run against a cloud-mode preview with synthetic credentials; no production requests.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true});
const game={id:'11111111-1111-4111-8111-111111111111',tournament_id:'22222222-2222-4222-8222-222222222222',number:'1',court:'1',team_a:'Alpha / Alice',team_b:'Beta / Bob',referee:'Ref / Ref2',game_rating:'Normal',set1_team_a:'0',set1_team_b:'0',set2_team_a:'',set2_team_b:'',set3_team_a:'',set3_team_b:'',point_history:'[]',completed:false,score_revision:0,score_entry_state:null};
const entry={games:[game],allTeams:['Ref / Ref2'],link:{id:'link',game_id:game.id,court:null,expires_at:null,used_at:null}};
const commands=[], errors=[], receipts=new Map();
let owner=null;
async function device() {
 const context=await browser.newContext();
 await context.route('https://example.supabase.co/**', async route=>{
  const request=route.request(),headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'};
  const reply=(json,status=200)=>route.fulfill({json,status,headers});
  if(request.method()==='OPTIONS')return reply({});
  const body=request.method()==='GET'?Object.fromEntries(new URL(request.url()).searchParams):request.postDataJSON();
  if(owner && owner!==body.deviceId)return reply({error:'Dieses Spiel wird bereits auf einem anderen Geraet erfasst.'},423);
  owner=body.deviceId;
  if(request.method()==='GET')return reply(entry);
  if(body.action)return reply({ok:true});
  if(receipts.has(body.operationId))return reply(receipts.get(body.operationId));
  if(body.baseRevision!==game.score_revision)return reply({error:'Revision conflict'},409);
  commands.push(body);
  const history=JSON.parse(game.point_history),delta=body.historyDelta;
  game.point_history=JSON.stringify([...history.slice(delta.drop,delta.drop+delta.keep),...delta.append]);
  for(let i=1;i<=3;i++)for(const side of ['A','B'])game[`set${i}_team_${side.toLowerCase()}`]=body[`set${i}Team${side}`];
  game.referee=body.referee;game.completed=body.completed;game.score_entry_state=body.scoreEntryState;game.score_revision++;
  const ack={ok:true,operationId:body.operationId,revision:game.score_revision,completed:body.completed};receipts.set(body.operationId,ack);
  return reply(ack);
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
 await page.goto((process.env.SCORE_PREVIEW_URL||'http://127.0.0.1:4173/')+'?token=handover');
 return {context,page};
}
const saved=async page=>{
 await page.waitForFunction(id=>{const r=JSON.parse(localStorage.getItem('courtboard.outbox.v2.'+id)||'null');return r&&r.pending.length===0&&!r.blocked},game.id);
};
const session=()=>JSON.parse(game.score_entry_state);
try {
 const first=await device();const page=first.page;
 await page.getByRole('button',{name:'Weiter',exact:true}).click();
 await page.getByRole('button',{name:'Alpha',exact:true}).click();
 await page.getByRole('button',{name:'Beta',exact:true}).click();
 await page.getByRole('button',{name:'Alpha / Alice',exact:true}).click();
 await page.getByRole('button',{name:'Alice',exact:true}).click();
 await page.getByRole('button',{name:'Bob',exact:true}).click();
 await page.getByRole('button',{name:/alle 5 Punkte/}).click();
 await page.getByRole('button',{name:'Satz starten',exact:true}).click();
 await page.locator('.team-point-button').first().waitFor();await saved(page);
 assert.equal(session().firstServerTeamA,'Alice');assert.equal(session().firstServerTeamB,'Bob');
 assert.equal(session().setScore.A,0,'setup persists before first point');
 // Alternating rally winners exercise service rotation; at five points swap sides.
 for(const index of [0,1,0,1,0])await page.locator('.team-point-button').nth(index).click();
 await page.getByRole('button',{name:'Seiten gewechselt'}).click();
 await page.waitForFunction(()=>!document.querySelector('.team-point-button:disabled'));
 await saved(page);assert.equal(session().leftTeam,'B');assert.equal(session().sideChangeAck,5);
 await page.locator('.timeout-button').first().click();
 await page.getByRole('button',{name:'Auszeit starten',exact:true}).click();
 await saved(page);
 const before=session();assert.equal(before.activeTimeoutTeam,'B');
 const locked=await device();await locked.page.getByText(/bereits auf einem anderen Geraet/).waitFor();await locked.context.close();
 await first.context.close();owner=null; // Existing admin release/expired lock, tested separately in SQL.
 const second=await device();
 assert.equal(await second.page.evaluate(()=>localStorage.getItem('courtboard.score-entry.handover')),null);
 await second.page.getByRole('button',{name:'Weiter',exact:true}).click();
 await second.page.locator('.team-point-button').first().waitFor();await saved(second.page);
 for(const key of ['activeSet','servingTeam','firstServerTeamA','firstServerTeamB','captainTeamA','captainTeamB','leftTeam','setScore','serverIndex','serveCounts','sideChangeAck','timeoutScore','timeoutEndsAt','undo'])assert.deepEqual(session()[key],before[key],key);
 await second.page.getByRole('button',{name:'Beenden',exact:true}).click();await saved(second.page);
 await second.page.getByRole('button',{name:'Letzte Punkteingabe rückgängig'}).click();
 await second.page.waitForFunction(()=>!document.querySelector('.team-point-button:disabled'));await saved(second.page);
 assert.deepEqual(session().setScore,{A:2,B:2});assert.equal(session().leftTeam,'A');
 assert.equal(session().undo.length,4);assert.equal(session().activeTimeoutTeam,null);
 // The first browser's storage is gone; the second still continues with the correct rotation.
 await second.page.locator('.team-point-button').nth(1).click();await saved(second.page);
 assert.deepEqual(session().setScore,{A:2,B:3});assert.equal(session().servingTeam,'B');
 // Start a separate synthetic set-end fixture and verify the setup boundary.
 await second.context.close();owner=null;
 game.set1_team_a='15';game.set1_team_b='13';game.point_history='[]';game.score_revision++;
 game.score_entry_state=JSON.stringify({...session(),setScore:{A:15,B:13},undo:[]});
 const third=await device();
 await third.page.getByRole('button',{name:'Letzte Eingabe fortsetzen'}).click();
 await third.page.getByRole('button',{name:'Satz 1 abschließen',exact:true}).click();
 await third.page.getByRole('button',{name:'Satz bestätigen',exact:true}).click();
 await third.page.getByRole('heading',{name:'Erster Aufschlag?',exact:true}).waitFor();await saved(third.page);
 assert.equal(session().activeSet,2);assert.equal(session().workflowStep,'servers');assert.equal(session().servingTeam,'');
 await third.context.close();owner=null;
 const fourth=await device();
 await fourth.page.getByRole('button',{name:'Weiter',exact:true}).click();
 await fourth.page.getByRole('heading',{name:'Erster Aufschlag?',exact:true}).waitFor();
 assert.equal(await fourth.page.getByRole('heading',{name:'Kapitän?',exact:true}).count(),0);
 await fourth.page.getByRole('button',{name:'Beta / Bob',exact:true}).click();
 await fourth.page.getByRole('button',{name:'Alpha',exact:true}).click();
 await fourth.page.getByRole('button',{name:'Beta',exact:true}).click();
 await fourth.page.getByRole('button',{name:/alle 7 Punkte/}).click();
 await fourth.page.locator('.team-point-button').first().waitFor();await saved(fourth.page);
 assert.equal(session().activeSet,2);assert.equal(session().servingTeam,'B');assert.deepEqual(session().setScore,{A:0,B:0});
 assert.equal(errors.length,0,errors.join('\n'));
 console.log(JSON.stringify({passed:true,checks:['setup before first point','service rotation','side change','timeout deadline','locked second device','fresh-device resume through referee confirmation','undo across handover','continued scoring','handover at set boundary'],commands:commands.length}));
} finally {await browser.close()}
