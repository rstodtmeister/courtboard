import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../src/refereeSuggestions.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {refereeSuggestions: suggest, refereeOptionGroups: groups, refereeRound} = await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const game = (n, round, a, b, extra={}) => ({id:String(n),number:String(n),tournament_id:'t',round,team_a:a,team_b:b,court:'1',completed:false,...extra});
const teams = (target, games) => suggest(target,games).map(s=>s.team);
test('recognizes group and KO labels without confusing L and W with groups',()=>{
 for(const [label,kind] of [['A','group'],['Gruppe B','group'],['8F','knockout'],['4F','knockout'],['W','winner'],['W2','winner'],['L1','loser'],['2F','semi'],['F','final'],['Platzierung','unknown']]) assert.equal(refereeRound(label).kind,kind);
});
test('three-team group, fair distribution and strict group scope',()=>{
 const target=game(1,'A','A1','A2');
 const schedule=[target,game(2,'A','A1','A3'),game(3,'B','B1','B2')];
 assert.deepEqual(teams(target,schedule),['A3']);
 schedule.push(game(4,'A','A4','A2',{referee:'A3'}));
 assert.deepEqual(teams(target,schedule),['A4']);
});
test('exclude unresolved teams and simultaneous or active duties on other courts',()=>{
 const target=game(1,'A','a','b',{game_date:'2026-09-14T10:00:00'});
 const schedule=[target,game(2,'A','c','d'),game(3,'A','Sieger Spiel 7','(Freilos)'),game(4,'B','c','e',{court:'2',game_date:target.game_date}),game(5,'B','f','g',{court:'3',referee:'d',score_locked_by_device:'device'})];
 assert.deepEqual(teams(target,schedule),[]);
});
test('opening KO round uses latest known matchup on same court, including later rounds',()=>{
 const target=game(1,'W1','a','b');
 const schedule=[target,game(2,'W1','c','d'),game(3,'W2','e','f'),game(4,'W2','Sieger Spiel 1','g'),game(5,'W1','h','i',{court:'2'})];
 assert.deepEqual(teams(target,schedule),['e','f']);
});
test('previous match tree decides; first winner round is the loser exception',()=>{
 for(const [round,expected] of [['W1','b'],['W2','a'],['L1','b'],['L2','b']]) {
  const previous=game(1,round,'a','b',{completed:true,result:'2:0'}),target=game(2,'L3','c','d');
  assert.deepEqual(teams(target,[previous,target]),[expected]);
 }
});
test('live scores, unknown winner round and missing previous result produce no recommendation',()=>{
 const target=game(2,'W3','c','d');
 for(const previous of [game(1,'W2','a','b',{result:'1:0'}),game(1,'W','a','b',{completed:true,result:'2:0'}),game(1,'W2','a','b',{completed:true})]) assert.deepEqual(teams(target,[previous,target]),[]);
});
test('double KO semifinal uses preceding loser-tree loser; final and bronze stay manual',()=>{
 const previous=game(1,'L4','a','b',{completed:true,winner_team:'a'});
 for(const round of ['2F','HF']) {const target=game(2,round,'c','d'); assert.deepEqual(teams(target,[previous,target]),['b']);}
 for(const round of ['F','1F','3P','Spiel um Platz 3']) {const target=game(2,round,'c','d');assert.deepEqual(teams(target,[previous,target]),[]);}
});
test('single KO opening and subsequent rounds',()=>{
 const opening=game(1,'8F','a','b'),late=game(4,'8F','c','d');
 assert.deepEqual(teams(opening,[opening,late]),['c','d']);
 const previous={...opening,completed:true,result:'0:2'},target=game(2,'4F','e','f');
 assert.deepEqual(teams(target,[previous,target]),['a']);
});
test('court order is honored, target draft court works, other tournaments do not contribute',()=>{
 const previous=game(8,'W2','a','b',{display_order:1,completed:true,result:'2:0'}),target=game(2,'W3','c','d',{display_order:2});
 assert.deepEqual(teams(target,[target,previous]),['a']);
 assert.deepEqual(teams({...target,court:'2'},[target,previous]),[]);
 assert.deepEqual(teams(target,[target,{...previous,tournament_id:'other'}]),[]);
});
test('recommendations preserve imported/manual selections and all options without mutating data',()=>{
 const target=game(1,'A','a','b',{referee:' HVV Schiedsgericht '}),schedule=[target,game(2,'A','a','c')];
 const before=JSON.stringify(schedule);const result=groups(target,schedule,['a','b','c','HVV Schiedsgericht']);
 assert.deepEqual(result.suggested.map(s=>s.team),['c']);
 assert.ok(result.remaining.includes(target.referee));assert.ok(result.remaining.includes('a'));
 assert.equal(JSON.stringify(schedule),before);
});
test('double KO may start with 8F/4F before explicit loser-tree labels',()=>{
 const opening=game(1,'8F','a','b'),late=game(3,'4F','e','f'),loserGame=game(4,'L1','g','h');
 assert.deepEqual(teams(opening,[opening,late,loserGame]),['g','h']);
 const next=game(2,'4F','c','d');
 assert.deepEqual(teams(next,[{...opening,completed:true,result:'2:0'},next,loserGame]),['b']);
 assert.deepEqual(teams(loserGame,[opening,{...late,completed:true,result:'2:0'},loserGame]),['e']);
});
