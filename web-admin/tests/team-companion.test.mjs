import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source=await readFile(new URL('../src/teamCompanionLogic.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {teamCompanion,resolveTeam,teamResult}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const game=(number,extra={})=>({id:String(number),number:String(number),court:'1',team_a:'A',team_b:'B',completed:false,...extra});
test('court queue counts unfinished games only and honors administrator ordering',()=>{
 const games=[game(1,{completed:true}),game(2,{display_order:20}),game(3,{display_order:10,team_a:'C',team_b:'D'}),game(4,{court:'2',team_a:'C',team_b:'D',referee:'A'})];
 const data=teamCompanion(games,'A');
 assert.equal(data.duties[0].ahead,1);assert.equal(data.duties[1].ahead,0);
 assert.equal(data.duties[1].role,'referee');assert.equal(data.results.length,1);
 assert.equal(teamCompanion([game(1,{court:null})],'A').duties[0].ahead,null);
});
test('assigned outcome references resolve after confirmed results, never live leads',()=>{
 const first=game(1,{result:'2:0'}),later=game(2,{team_a:'C',team_b:'D',referee:'Verlierer Spiel 1'});
 assert.equal(teamCompanion([first,later],'B').duties.filter(d=>d.role==='referee').length,0);
 const completed={...first,completed:true};
 assert.equal(teamCompanion([completed,later],'B').duties[0].role,'referee');
 assert.equal(resolveTeam('Gewinner Spiel 1',[completed]),'A');
 assert.equal(resolveTeam('Sieger Spiel 1',[completed]),'A');
});
test('outcome chains resolve without looping; unknown results remain unknown',()=>{
 const games=[game(1,{completed:true,result:'2:0'}),game(2,{completed:true,team_a:'Gewinner Spiel 1',winner_team:'1'})];
 assert.equal(resolveTeam('Gewinner Spiel 2',games),'A');
 assert.equal(resolveTeam('Verlierer Spiel 3',games),'Verlierer Spiel 3');
 assert.equal(resolveTeam('Gewinner Spiel 1',[game(1,{completed:true})]),'Gewinner Spiel 1');
 const cycle=[game(1,{completed:true,team_a:'Gewinner Spiel 1',winner_team:'1'})];
 assert.equal(resolveTeam('Gewinner Spiel 1',cycle),'Gewinner Spiel 1');
});
test('no recommendations become assignments and absent teams have no duties',()=>{
 assert.deepEqual(teamCompanion([game(1)],'C'),{duties:[],results:[]});
 assert.deepEqual(teamCompanion([game(1)],''),{duties:[],results:[]});
});

test('preceding list follows court order, excludes finished and other-court games, and updates after completion',()=>{
 const target=game(9,{display_order:30});
 const first=game(5,{display_order:10,team_a:'C',team_b:'D'});
 const second=game(2,{display_order:20,team_a:'C',team_b:'D'});
 const schedule=[target,second,first,game(1,{completed:true}),game(3,{court:'2',team_a:'C',team_b:'D'})];
 const duty=teamCompanion(schedule,'A').duties[0];
 assert.deepEqual(duty.preceding.map(g=>g.id),['5','2']);
 assert.equal(duty.ahead,duty.preceding.length);
 const updated=teamCompanion(schedule.map(g=>g.id==='5'?{...g,completed:true}:g),'A').duties[0];
 assert.deepEqual(updated.preceding.map(g=>g.id),['2']);
});

test('results always use the selected team perspective including individual sets',()=>{
 const match=game(1,{completed:true,result:'2:1',winner_team:'A',set1_team_a:'21',set1_team_b:'18',set2_team_a:'17',set2_team_b:'21',set3_team_a:'15',set3_team_b:'12'});
 const a=teamResult(match,'A',[match]),b=teamResult(match,'B',[match]);
 assert.equal(a.status,'Sieg');assert.equal(a.total,'2:1');assert.equal(a.opponent,'B');
 assert.equal(b.status,'Niederlage');assert.equal(b.total,'1:2');assert.equal(b.opponent,'A');
 assert.deepEqual(b.sets.map(s=>[s.own,s.opponent]),[[18,21],[21,17],[12,15]]);
});
test('missing scores and special ratings never invent results or unused sets',()=>{
 const match=game(1,{completed:true,game_rating:'Nichtantritt',winner_team:'2',set1_team_a:'0',set1_team_b:'21',set2_team_a:'',set2_team_b:null,set3_team_a:'0',set3_team_b:'0'});
 const result=teamResult(match,'B',[match]);
 assert.equal(result.status,'Sieg');assert.equal(result.total,null);assert.equal(result.rating,'Nichtantritt');
 assert.deepEqual(result.sets,[{number:1,own:21,opponent:0}]);
 assert.equal(teamResult(game(1,{completed:true}),'A',[]).status,'Abgeschlossen');
});
