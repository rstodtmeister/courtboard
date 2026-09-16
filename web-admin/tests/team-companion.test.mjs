import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source=await readFile(new URL('../src/teamCompanionLogic.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {teamCompanion,resolveTeam}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
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
