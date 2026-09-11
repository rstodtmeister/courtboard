import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const url = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const patchUrl = url(await readFile(new URL('../src/scorePatch.ts',import.meta.url),'utf8'));
const { historyDelta } = await import(patchUrl);
const source = (await readFile(new URL('../src/scoreOutbox.ts',import.meta.url),'utf8')).replace("'./scorePatch'",JSON.stringify(patchUrl));
const { createScoreOutbox, ScoreTransportError } = await import(url(source));
const flush = () => new Promise(resolve => setImmediate(resolve));
const draft = (n, completed=false) => ({referee:'C',set1_team_a:String(n),set1_team_b:'0',completed,point_history:JSON.stringify(Array.from({length:n},(_,i)=>({set:1,team:'A',scoreA:i+1,scoreB:0})))});
function setup(shared) {
 const map=shared??new Map(); let counter=0;
 const state={online:true,calls:[],failStorage:false};
 const storage={get length(){return map.size},key:i=>[...map.keys()][i],getItem:k=>map.get(k)??null,setItem:(k,v)=>{if(state.failStorage)throw Error('quota');map.set(k,v)}};
 const box=createScoreOutbox({storage,uuid:()=>`op-${++counter}`,online:()=>state.online,send:(record,command)=>new Promise((resolve,reject)=>state.calls.push({command,resolve:()=>resolve({ok:true,operationId:command.operationId,revision:command.baseRevision+1,completed:command.completed}),reject}))});
 box.start(); const game={id:'g',score_revision:0};box.initialize('token',game,{games:[game]},'device',draft(0));
 return {box,state,map};
}
test('rapid local points and undo serialize; completion waits for server',async()=>{
 const {box,state}=setup();
 try {
 await box.enqueue('g',draft(1));await box.enqueue('g',draft(2));await box.enqueue('g',draft(1));
 let done=false;const final=box.enqueue('g',draft(1,true)).then(()=>done=true);
 assert.equal(box.status('g').pending,4);assert.equal(state.calls.length,1);assert.equal(done,false);
 for(let i=0;i<4;i++){assert.equal(state.calls[i].command.baseRevision,i);state.calls[i].resolve();await flush();}
 await final;assert.equal(box.status('g').pending,0);assert.equal(done,true);
 }finally{box.stop()}
});
test('lost response retries exact command and never overtakes the head',async()=>{
 const {box,state}=setup();try{
 await box.enqueue('g',draft(1));await box.enqueue('g',draft(2));
 state.calls[0].reject(Error('lost acknowledgement'));await flush();assert.equal(state.calls.length,1);
 box.retry();assert.deepEqual(state.calls[1].command,state.calls[0].command);
 state.calls[1].resolve();await flush();assert.equal(state.calls[2].command.baseRevision,1);state.calls[2].resolve();await flush();assert.equal(box.status('g').pending,0);
 }finally{box.stop()}
});
test('reload retains frozen operation and ignores late response from previous owner',async()=>{
 const first=setup();await first.box.enqueue('g',draft(1));first.box.stop();
 const second=setup(first.map);try{second.box.retry();assert.deepEqual(second.state.calls[0].command,first.state.calls[0].command);
 first.state.calls[0].resolve();await flush();assert.equal(second.box.status('g').pending,1);
 second.state.calls[0].resolve();await flush();assert.equal(second.box.status('g').pending,0);
 }finally{second.box.stop()}
});
test('offline writes survive and revision conflict preserves journal',async()=>{
 const {box,state}=setup();try{state.online=false;await box.enqueue('g',draft(1));await box.enqueue('g',draft(2));assert.equal(state.calls.length,0);
 state.online=true;box.retry();state.calls[0].reject(new ScoreTransportError('revision conflict',true));await flush();
 assert.equal(box.status('g').pending,2);assert.match(box.status('g').blocked,/conflict/);box.retry();assert.equal(state.calls.length,1);
 assert.equal(JSON.parse(box.export('g')).token,undefined);
 }finally{box.stop()}
});
test('storage failure blocks further input and exposes unsaved draft for backup',async()=>{
 const {box,state}=setup();try{state.failStorage=true;await assert.rejects(box.enqueue('g',draft(1)));assert.ok(box.status('g').blocked);
 assert.equal(JSON.parse(box.export('g')).unsavedDraft.set1_team_a,'1');assert.equal(state.calls.length,0);
 state.failStorage=false;await box.resumeStorage('g');assert.equal(state.calls.length,1);state.calls[0].resolve();await flush();assert.equal(box.status('g').blocked,'');assert.equal(box.latest('g').set1_team_a,'1');
 }finally{box.stop()}
});
test('rolling 120-entry history sends one entry; undo sends none',()=>{
 const entries=Array.from({length:120},(_,i)=>({set:3,team:'A',scoreA:i,scoreB:0}));const next=[...entries.slice(1),{set:3,team:'B',scoreA:119,scoreB:1}];
 assert.deepEqual(historyDelta(JSON.stringify(entries),JSON.stringify(next)),{drop:1,keep:119,append:next.slice(-1)});
 assert.deepEqual(historyDelta(JSON.stringify(next),JSON.stringify(next.slice(0,-1))),{drop:0,keep:119,append:[]});
 assert.ok(JSON.stringify(historyDelta(JSON.stringify(entries),JSON.stringify(next))).length<150);
});
test('a blocked court does not hold back three other courts',async()=>{
 const {box,state}=setup();try{
 for(let i=1;i<=3;i++){const game={id:'g'+i,score_revision:0};box.initialize('t'+i,game,{games:[game]},'d',draft(0))}
 await Promise.all(['g','g1','g2','g3'].map(id=>box.enqueue(id,draft(1))));
 assert.equal(state.calls.length,4);state.calls[0].reject(new ScoreTransportError('court conflict',true));
 state.calls.slice(1).forEach(call=>call.resolve());await flush();
 assert.equal(box.status('g').pending,1);for(const id of ['g1','g2','g3'])assert.equal(box.status(id).pending,0);
 }finally{box.stop()}
});
