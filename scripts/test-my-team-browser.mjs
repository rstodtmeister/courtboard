// Run against a local-mode build preview on port 4174.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 page.on('requestfailed',r=>console.log('Request failed:',r.url(),r.failure()));
 page.on('console',m=>{if(m.type()==='error')console.log(m.text())});
 page.on('pageerror',error=>console.log('Page error:',error.message));
 const teams=['Müller / Schmidt mit einem besonders langen Teamnamen','Weber / Fischer'];
 const games=[1,2,3,4].map(n=>({id:String(n),tournament_id:'t',number:String(n),court:String(n),team_a:n===1?teams[0]:teams[1],team_b:'Gäste '+n,completed:false,point_history:[]}));
 await page.addInitScript(()=>{if(!localStorage.getItem('courtboard.localData.v1'))localStorage.setItem('courtboard.localData.v1',JSON.stringify({session:null,admins:[],tournaments:[{id:'t',name:'Test',courts:['1','2','3','4'],court_streams:{}},{id:'other',name:'Anderes Turnier',courts:['1'],court_streams:{}}],games:[],links:[]}));});
 await page.route('**/api/games',route=>route.fulfill({headers:{'access-control-allow-origin':'*'},json:{games}}));
 await page.goto('http://127.0.0.1:4174/?view=courts&tournamentId=t');
 const select=page.getByRole('combobox',{name:/Mein Team/});
 await select.waitFor({timeout:8000}).catch(async e=>{console.log(await page.locator('body').innerText());throw e;});
 await select.selectOption(teams[0]);
 assert.equal(await page.locator('.my-team-game').count(),1);
 assert.equal(await page.locator('.display-court-section').count(),4);
 assert.ok(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),'Mobile page must not overflow');
 await page.reload();await select.waitFor();assert.equal(await select.inputValue(),teams[0]);
 await select.selectOption(teams[1]);assert.equal(await page.locator('.my-team-game').count(),3);
 await page.getByRole('button',{name:'Mein Team entfernen'}).click();assert.equal(await page.locator('.my-team-game').count(),0);
 await page.reload();await select.waitFor();assert.equal(await select.inputValue(),'');
 await select.selectOption(teams[0]);await page.screenshot({path:'/private/tmp/courtboard-my-team-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:900});await page.screenshot({path:'/private/tmp/courtboard-my-team-desktop.png'});
 await page.goto('http://127.0.0.1:4174/?view=courts&tournamentId=other');await select.waitFor();assert.equal(await select.inputValue(),'');
 console.log('Passed: mobile width, all courts retained, selection/change/removal, persistence, tournament isolation.');
} finally {await browser.close();}
