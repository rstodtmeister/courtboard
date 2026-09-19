import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';

const playwrightModule=process.env.PLAYWRIGHT_MODULE||new URL('../web-admin/node_modules/playwright-core/index.mjs',import.meta.url).href;
const {chromium}=await import(playwrightModule);
const localChrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath=process.env.CHROMIUM_EXECUTABLE_PATH||(existsSync(localChrome)?localChrome:undefined);
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto(process.env.COURT_STREAM_PREVIEW_URL||'http://127.0.0.1:4175/tests/browser/court-stream-actions.html');
 await page.getByRole('button',{name:'Livestream'}).click();

 const input=page.getByLabel('YouTube- oder Twitch-Livestream');
 const save=page.getByRole('button',{name:'Stream speichern',exact:true});
 const remove=page.getByRole('button',{name:'Stream entfernen',exact:true});
 const savedValues=page.getByLabel('Gespeicherte Streamwerte');

 assert.equal(await save.isDisabled(),true);
 assert.equal(await remove.isDisabled(),true);

 await input.fill('https://www.twitch.tv/courtboard');
 assert.equal(await save.isEnabled(),true);
 assert.equal(await remove.isDisabled(),true);
 await save.click();
 await page.getByRole('button',{name:'Speichert…',exact:true}).waitFor();
 await page.getByText('["https://www.twitch.tv/courtboard"]',{exact:true}).waitFor();
 assert.equal(await save.isDisabled(),true);
 assert.equal(await remove.isEnabled(),true);

 await input.fill('https://www.twitch.tv/anderer_court');
 assert.equal(await save.isEnabled(),true);
 assert.equal(await remove.isEnabled(),true);

 await remove.click();
 await page.getByRole('button',{name:'Entfernt…',exact:true}).waitFor();
 await page.getByText('["https://www.twitch.tv/courtboard",""]',{exact:true}).waitFor();
 assert.equal(await input.inputValue(),'');
 assert.equal(await save.isDisabled(),true);
 assert.equal(await remove.isDisabled(),true);
 assert.ok(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth));
 console.log('Passed: court stream save, edit and remove button states in Chromium.');
}finally{
 await browser.close();
}
