import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../../supabase/functions/_shared/hvv-referee.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { resolveHvvRefereeOption: resolve, hvvRefereeOptions } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const seeds = [{seed:1,team:'Änne / Bärbel'}, {seed:2,team:'Carla / Dora'}];
const options = [{value:'hvv-seed-771',label:'Setzung 1'}, {value:'hvv-seed-772',label:'Setzung 2'},
 {value:'hvv-win-9',label:'Sieger Spiel 9'}, {value:'hvv-lose-9',label:'Verlierer Spiel 9'}];
const games = [{number:'9',team_a:'Änne / Bärbel',team_b:'Carla / Dora',completed:true,winner_team:'1'}];
test('named teams use actual option value for their seed, not the seed or display name',()=>{
 assert.equal(resolve('Änne / Bärbel',seeds,options),'hvv-seed-771');
 assert.equal(resolve('  CARLA/\u00a0DORA ',seeds,options),'hvv-seed-772');
});
test('known winner and loser use seed options even when reference options exist',()=>{
 assert.equal(resolve('Gewinner Spiel 9',seeds,options,games),'hvv-seed-771');
 assert.equal(resolve('Verlierer Spiel 9',seeds,options,games),'hvv-seed-772');
});
test('pending matches retain winner/loser references and never use provisional scores',()=>{
 const pending=[{...games[0],completed:false}];
 assert.equal(resolve('Gewinner Spiel 9',seeds,options,pending),'hvv-win-9');
 assert.equal(resolve('Verlierer Spiel 9',seeds,options,pending),'hvv-lose-9');
});
test('winner on side B maps correctly and completed nested references resolve',()=>{
 assert.equal(resolve('Sieger Spiel 9',seeds,options,[{...games[0],winner_team:'2'}]),'hvv-seed-772');
 const nested=[...games,{number:'10',team_a:'Sieger Spiel 9',team_b:'Carla / Dora',completed:true,winner_team:'1'}];
 assert.equal(resolve('Gewinner Spiel 10',seeds,options,nested),'hvv-seed-771');
});
test('missing, duplicate or conflicting seed entries cannot assign a wrong team',()=>{
 assert.throws(()=>resolve('Other Team',seeds,options),/Setzlistennummer/);
 assert.throws(()=>resolve('Änne / Bärbel',[...seeds,{seed:3,team:'Änne / Bärbel'}],options),/Setzlistennummer/);
 assert.throws(()=>resolve('Änne / Bärbel',[...seeds,{seed:1,team:'Other'}],options),/nicht eindeutig/);
});
test('ambiguous or disabled HVV options and raw option IDs cannot be selected',()=>{
 assert.throws(()=>resolve('Änne / Bärbel',seeds,[...options,{value:'other-id',label:'Setzung 1'}]),/eindeutige HVV-Auswahl/);
 assert.throws(()=>resolve('Änne / Bärbel',seeds,[{...options[0],disabled:true}]),/eindeutige HVV-Auswahl/);
 assert.throws(()=>resolve('hvv-seed-771',seeds,options),/Setzlistennummer/);
});
test('seed labels never confuse a match number with a seed',()=>{
 assert.throws(()=>resolve('Änne / Bärbel',seeds,[{value:'wrong',label:'Sieger Spiel 1'}]),/eindeutige HVV-Auswahl/);
 for(const label of ['1','1.','1. Setzung','Setzplatz 1','Setzliste 1','Setzlistennummer 1']) {
  assert.equal(resolve('Änne / Bärbel',seeds,[{value:'seed-option',label}]),'seed-option');
 }
});

test('real HVV Schiri1 labels and values are parsed exactly',()=>{
 const actual=hvvRefereeOptions(`<select name="schiri1par"><option value="">ohne / Freitext</option><option value="s_12">Setzliste 12</option><option value="g_w_9">Spiel 9 Gewinner</option><option value="g_l_9">Spiel 9 Verlierer</option></select>`);
 assert.equal(resolve('Johann - Schilling (12)',[],actual),'s_12');
 assert.equal(resolve('Gewinner Spiel 9',[],actual),'g_w_9');
 assert.equal(resolve('Verlierer Spiel 9',[],actual),'g_l_9');
});
test('cycles and ambiguous source games keep unresolved references',()=>{
 assert.equal(resolve('Sieger Spiel 9',seeds,options,[{...games[0],team_a:'Sieger Spiel 9'}]),'hvv-win-9');
 assert.equal(resolve('Sieger Spiel 9',seeds,options,[...games,...games]),'hvv-win-9');
});
