import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const team='Müller / Schmidt & Freunde';
 const games=[
 {id:'1',number:'1',team_a:'Gäste',team_b:'Andere',court:'1',completed:false},
 {id:'2',number:'2',team_a:team,team_b:'Andere',court:'1',completed:false},
 {id:'3',number:'3',team_a:'Gäste',team_b:'Andere',court:'2',referee:team,completed:false},
 {id:'5',number:'5',team_a:team,team_b:'Gäste',court:'1',completed:false},
 {id:'4',number:'4',team_a:team,team_b:'Andere',court:'1',completed:true,result:'2:0'},
 ].map(game=>({...game,tournament_id:'t'}));
 await page.addInitScript(()=>{if(!localStorage.getItem('courtboard.localData.v1'))localStorage.setItem('courtboard.localData.v1',JSON.stringify({session:null,admins:[],tournaments:[{id:'t',name:'Testturnier',courts:['1','2'],court_streams:{}}],games:[],links:[]}));});
 await page.route('**/api/games',route=>route.fulfill({headers:{'access-control-allow-origin':'*'},json:{games}}));
 await page.goto('http://127.0.0.1:4174/?view=courts&tournamentId=t');
 await page.getByRole('combobox',{name:/Mein Team/}).selectOption(team);
 await page.getByRole('link',{name:'Turnierbegleiter →'}).click();
 await page.getByRole('heading',{name:'Dein Turnierbegleiter'}).waitFor();
 assert.equal(await page.locator('.companion-duty:visible').count(),2);
 assert.match(await page.locator('.companion-duty').first().innerText(),/Noch 1 Spiel vor euch/);
 assert.match(await page.locator('.companion-duty').nth(1).innerText(),/Schiedsgericht/);
 const nextCards=page.locator('.companion-duty:visible');
 const lastCard=await nextCards.last().boundingBox();
 assert.ok(lastCard.y+lastCard.height<640,'Both next duties should fit a small phone screen');
 await page.getByText('Weitere Aufgaben (1)',{exact:true}).click();
 assert.equal(await page.locator('.companion-duty:visible').count(),3);
 await page.getByText('Weitere Aufgaben (1)',{exact:true}).click();
 await page.getByText('Eure Ergebnisse (1)',{exact:true}).click();
 assert.match(await page.locator('.companion-results').innerText(),/2:0/);
 await page.getByText('Eure Ergebnisse (1)',{exact:true}).click();
 assert.ok(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth));
 const url=page.url();assert.equal(new URL(url).searchParams.get('team'),team);
 await page.screenshot({path:'/private/tmp/courtboard-companion-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:900});
 await page.screenshot({path:'/private/tmp/courtboard-companion-desktop.png',fullPage:true});
 await page.getByRole('link',{name:'← Alle Courts'}).click();
 await page.getByRole('combobox',{name:/Mein Team/}).waitFor();
 assert.equal(await page.getByRole('combobox',{name:/Mein Team/}).inputValue(),team);
 await page.evaluate(()=>localStorage.removeItem('courtboard.myTeam.v1.t'));
 await page.goto(url);await page.getByRole('heading',{name:'Dein Turnierbegleiter'}).waitFor();
 assert.equal(await page.getByRole('combobox',{name:/Mein Team/}).inputValue(),team);
 await page.getByRole('combobox',{name:/Mein Team/}).selectOption('');
 await page.getByRole('heading',{name:'Welches Team seid ihr?'}).waitFor();
 await page.reload();await page.getByRole('heading',{name:'Welches Team seid ihr?'}).waitFor();
 assert.deepEqual(errors,[]);
 console.log('Passed: main entry, duties, queue, results, mobile width, desktop, direct team link, return, persistence and clearing.');
} finally {await browser.close();}
