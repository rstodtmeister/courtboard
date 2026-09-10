import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const root = new URL('../../supabase/functions/', import.meta.url);
const url = (source) => 'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64');
const source = await readFile(new URL('_shared/hvv-delivery.ts',root),'utf8');
const mockHvv = url(`export const hvvCredentialsFromEnv=()=>({}); export const submitGameToHvv=(...args)=>globalThis.__hvvTest.submit(...args); export const refreshTournamentGamesFromHvv=(...args)=>globalThis.__hvvTest.refresh(...args);`);
const { processHvvDelivery } = await import(url(source.replace("'./hvv.ts'",JSON.stringify(mockHvv))));
for (const scenario of ['success','submit failure','refresh failure','refresh retry','lost lease']) {
  test(`durable HVV delivery: ${scenario}`, async () => {
    const calls=[];
    const state={
      submit: async()=>{ calls.push('submit'); if(scenario==='submit failure')throw new Error('offline'); },
      refresh: async()=>{ calls.push('refresh'); if(scenario==='refresh failure')throw new Error('refresh offline'); },
    };
    globalThis.__hvvTest=state;
    const client={rpc:async(name,args)=>{
      calls.push(name);
      if(name==='claim_hvv_delivery')return {data:{job:{phase:scenario==='refresh retry'?'refresh':'score',lease_token:'lease'},game:{id:'game',tournament_id:'t'}},error:null};
      if(name==='finish_hvv_delivery')state.finished=args;
      return {data:scenario!=='lost lease',error:null};
    }};
    try {
      await processHvvDelivery(client);
      if(scenario==='submit failure') { assert.equal(calls.includes('refresh'),false); assert.equal(state.finished.p_error,'offline'); }
      if(scenario==='refresh failure') { assert.equal(calls.includes('advance_hvv_delivery'),true); assert.equal(state.finished.p_error,'refresh offline'); }
      if(scenario==='refresh retry') { assert.equal(calls.includes('submit'),false); assert.equal(state.finished.p_error,null); }
      if(scenario==='lost lease') { assert.equal(calls.includes('refresh'),false); assert.equal(state.finished,undefined); }
      if(scenario==='success') { assert.deepEqual(calls,['claim_hvv_delivery','submit','advance_hvv_delivery','refresh','finish_hvv_delivery']); assert.equal(state.finished.p_error,null); }
    } finally { delete globalThis.__hvvTest; }
  });
}

test('score endpoint acknowledges a durable completion without waiting for HVV, and reports database timing', async()=>{
  let handler;
  const backgrounds=[];
  const calls=[];
  const previous={Deno:globalThis.Deno,EdgeRuntime:globalThis.EdgeRuntime};
  globalThis.Deno={serve:(fn)=>{handler=fn;}};
  globalThis.EdgeRuntime={waitUntil:(task)=>backgrounds.push(task)};
  globalThis.__scoreClient={rpc:async(name,args)=>{calls.push({name,args});return {data:{id:'test',edit_url:'https://example.invalid/edit'},error:null};}};
  let code=await readFile(new URL('submit-score/index.ts',root),'utf8');
  for(const [path,replacement] of [
    ['../_shared/cors.ts',url(await readFile(new URL('_shared/cors.ts',root),'utf8'))],
    ['../_shared/token.ts',url(await readFile(new URL('_shared/token.ts',root),'utf8'))],
    ['../_shared/score-validation.ts',url(await readFile(new URL('_shared/score-validation.ts',root),'utf8'))],
    ['../_shared/supabase.ts',url('export const createAdminClient=()=>globalThis.__scoreClient;')],
    ['../_shared/hvv-delivery.ts',url('export const processHvvDelivery=()=>new Promise(()=>{});')],
  ])code=code.replace(JSON.stringify(path),JSON.stringify(replacement));
  try {
    await import(url(code));
    const response=await handler(new Request('https://test/submit-score',{method:'POST',body:JSON.stringify({token:'test',gameId:'00000000-0000-0000-0000-000000000001',deviceId:'test',completed:true,set1TeamA:'15',set1TeamB:'13'})}));
    assert.equal(response.status,200);
    assert.equal((await response.json()).hvvStatus,'queued');
    assert.equal(calls.length,1); assert.equal(calls[0].name,'submit_score_atomic');
    assert.equal(calls[0].args.p_score.winnerTeam,'1');
    assert.match(response.headers.get('Server-Timing'),/database;dur=/);
    assert.equal(backgrounds.length,1);
    const invalid=await handler(new Request('https://test/submit-score',{method:'POST',body:JSON.stringify({token:'test',deviceId:'test',completed:true,set1TeamA:'13',set1TeamB:'13'})}));
    assert.equal(invalid.status,400); assert.equal(calls.length,1);
  } finally { Object.assign(globalThis,previous); delete globalThis.__scoreClient; }
});
