import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},
}).outputText).toString('base64');
const refereeSource = await readFile(new URL('../../supabase/functions/_shared/hvv-referee.ts', import.meta.url), 'utf8');
const refereeUrl = moduleUrl(refereeSource);
const hvvSource = (await readFile(new URL('../../supabase/functions/_shared/hvv.ts', import.meta.url), 'utf8'))
  .replace('"./hvv-referee.ts"', JSON.stringify(refereeUrl));
const { submitGameToHvv } = await import(moduleUrl(hvvSource));

const resultForm = `<form action="/testportal/save-result" method="post">
  <input type="hidden" name="spielid" value="259802"><select name="court"><option value="1" selected>1</option></select>
  <select name="wertungid"><option value="0" selected>Normal</option></select>
  <input name="s1pa" value="0"><input name="s1pb" value="0"><input name="s2pa" value="0"><input name="s2pb" value="0">
  <input name="s3pa" value="0"><input name="s3pb" value="0"><input type="submit" name="save" value="Speichern">
</form>`;
const detailForm = `<form action="beach_beach_veranstaltung_spielansetzung!browse.action" method="get">
  <input type="hidden" name="spielid" value="259802"><input type="hidden" name="beachrundeid" value="2533664">
  <input type="hidden" name="veranstaltungid" value="3624">
</form>`;
const browseForm = `<form action="beach_beach_veranstaltung_spielansetzung!input.action" method="get">
  <input type="hidden" name="spielid" value="259802"><input type="hidden" name="beachrundeid" value="2533664">
  <input type="hidden" name="veranstaltungid" value="3624">
</form>`;
const assignmentForm = `<form action="/testportal/beach_beach_veranstaltung_spielansetzung.action" method="post">
  <input type="hidden" name="spielid" value="259802"><input type="hidden" name="veranstaltungid" value="3624">
  <select name="schiri1par"><option value="">ohne / Freitext</option><option value="s_12">Setzliste 12</option>
    <option value="g_w_9">Spiel 9 Gewinner</option><option value="g_l_9">Spiel 9 Verlierer</option></select>
  <input name="schiri1parf" value="Alter Freitext"><select name="schiri2par"><option value="s_3" selected>Setzliste 3</option></select>
  <input name="schiri2parf" value="Zweiter Schiri"><input type="submit" name="save" value="Speichern">
</form>`;

function response(body, url) {
  const result = new Response(body, {status:200});
  Object.defineProperty(result, 'url', {value:url});
  return result;
}

for (const [referee, expected] of [
  ['Johann - Schilling (12)', 's_12'],
  ['Gewinner Spiel 9', 'g_w_9'],
  ['Verlierer Spiel 9', 'g_l_9'],
]) test(`submits ${referee} through the separate HVV Schiri1 form`, async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init={}) => {
    const href=String(url); calls.push({href,init});
    if (href.endsWith('beach_beach_turnier_spiel!input.action')) return response(resultForm, href);
    if (href.endsWith('/save-result')) return response('saved', href);
    if (href.includes('beach_beach_turnier_spiel!browse.action')) return response(detailForm, href);
    if (href.includes('spielansetzung!browse.action')) return response(browseForm, href);
    if (href.includes('spielansetzung!input.action')) return response(assignmentForm, href);
    if (href.endsWith('beach_beach_veranstaltung_spielansetzung.action')) return response('saved', href);
    throw new Error(`Unexpected URL ${href}`);
  };
  try {
    await submitGameToHvv({
      edit_url:'https://www.hvv-beach.de/testportal/beach_beach_turnier_spiel!input.action',
      edit_method:'POST', edit_data:'spielid=259802', court:'1', referee, game_rating:'Normal',
      set1_team_a:'',set1_team_b:'',set2_team_a:'',set2_team_b:'',set3_team_a:'',set3_team_b:'',
    }, {username:'test',password:'test'});
    const save = calls.find(call=>call.href.endsWith('beach_beach_veranstaltung_spielansetzung.action'));
    assert.ok(save, 'separate assignment form was not submitted');
    const body = new URLSearchParams(save.init.body);
    assert.equal(body.get('schiri1par'), expected);
    assert.equal(body.get('schiri1parf'), '');
    assert.equal(body.get('schiri2par'), 's_3');
    assert.equal(body.get('schiri2parf'), 'Zweiter Schiri');
    assert.equal(calls.filter(call=>call.init.method==='POST').length, 3);
  } finally { globalThis.fetch = originalFetch; }
});
