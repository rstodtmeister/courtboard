import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true});
try {
 for(const mobile of [false,true]) {
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000}});
  await page.goto('http://127.0.0.1:4174/tests/browser/referees.html');
  await page.getByTestId('saves').waitFor();
  let select;
  if(mobile) select=page.getByLabel('Schiedsgericht fuer Spiel 1',{exact:true});
  else {await page.getByRole('button',{name:'Bearbeiten',exact:true}).first().click();select=page.locator('label').filter({has:page.locator('.dialog-label').filter({hasText:/^Schiedsgericht$/})}).locator('select');}
  assert.equal(await select.inputValue(),'HVV Schiedsgericht');
  assert.equal(await page.getByTestId('saves').textContent(),'0');
  assert.match(await select.locator('option[value="Team C"]').textContent(),/Empfohlen.*Gruppe/);
  assert.equal(await select.locator('option[value="Team A"]').count(),1);
  await select.selectOption('Team C');
  if(!mobile) await page.getByRole('button',{name:'Speichern',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-testid="saves"]').textContent==='1');
  if(mobile) assert.equal(await select.inputValue(),'Team C');
  await page.close();
 }
 console.log('Desktop and mobile: imported assignment preserved, recommendation marked, explicit selection saved.');
} finally {await browser.close();}
