import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source=await readFile(new URL('../src/matchHistoryData.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {matchHistory}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const point=(scoreA,scoreB,extra={})=>({set:1,team:'A',scoreA,scoreB,...extra});
test('absent, malformed, timeout-only and invalid histories have no chart',()=>{
 for(const value of [null,'bad','{}','[null]',JSON.stringify([point(0,0,{type:'timeout'})]),JSON.stringify([point(-1,0)])]) assert.deepEqual(matchHistory(value),[]);
});
test('timeouts are separate markers and points stay grouped by set',()=>{
 const sets=matchHistory(JSON.stringify([point(1,0),point(1,1),point(1,1,{type:'timeout',team:'B'}),point(0,1,{set:2})]));
 assert.equal(sets.length,2);assert.equal(sets[0].points.length,2);assert.equal(sets[0].timeouts.length,1);
 assert.equal(sets[0].segments[0][0].scoreA,0);assert.equal(sets[0].partial,false);
});
test('truncated history and gaps are marked and never connected as invented points',()=>{
 const [set]=matchHistory(JSON.stringify([point(12,10),point(13,10),point(18,15)]));
 assert.equal(set.partial,true);assert.equal(set.segments.length,2);assert.equal(set.segments[0].length,2);
 assert.equal(set.segments[0][0].scoreA,12);
});
