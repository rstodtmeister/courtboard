// Run against a local-mode build served with `npm --prefix web-admin run preview -- --port 4174`.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('http://127.0.0.1:4174/');
  await page.waitForFunction(() => localStorage.getItem('courtboard.localData.v1'));
  for (const role of ['superadmin', 'admin']) {
    await page.evaluate(role => {
      const key = 'courtboard.localData.v1';
      const store = JSON.parse(localStorage.getItem(key));
      store.session = { user: { email: 'logout@example.invalid', role } };
      localStorage.setItem(key, JSON.stringify(store));
    }, role);
    await page.reload();
    await page.getByRole('button', { name: /^Admin\s*\d*$/ }).click();
    assert.equal(await page.getByRole('heading', { name: 'Admin einladen' }).count(), role === 'superadmin' ? 1 : 0);
    await page.getByRole('button', { name: 'Logout', exact: true }).click();
    await page.getByRole('heading', { name: 'Admin Login', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('courtboard.localData.v1')).session), null);
    await page.reload();
    await page.getByRole('heading', { name: 'Admin Login', exact: true }).waitFor();
  }
  console.log('Mobile logout for both admin roles and persistence after reload passed.');
} finally { await browser.close(); }
