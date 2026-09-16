import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const compile=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const {youtubeReplay}=await import(compile(await readFile(new URL('../src/youtubeReplay.ts',import.meta.url),'utf8')));
const game={completed:true,match_video_id:'abcdefghijk',match_started_at:'2026-09-16T11:23:00Z',match_ended_at:'2026-09-16T12:00:00Z',video_started_at:'2026-09-16T09:00:00Z'};
test('replay uses captured video and start, correction and fifteen seconds lead-in',()=>{
 assert.equal(youtubeReplay(game).seconds,8565);
 assert.equal(youtubeReplay({...game,video_offset_seconds:30}).seconds,8595);
 assert.equal(youtubeReplay({...game,video_offset_seconds:-30}).seconds,8535);
 assert.equal(youtubeReplay({...game,match_started_at:game.video_started_at}).seconds,0);
 assert.equal(youtubeReplay({...game,court:'9',configured_video_id:'differentid'}).url,'https://www.youtube.com/watch?v=abcdefghijk&t=8565s');
});
test('never invent replay timing for imports, missing metadata or out-of-stream matches',()=>{
 for(const extra of [{completed:false},{match_started_at:null},{match_ended_at:null},{video_started_at:null},{match_video_id:'bad'},{video_started_at:'bad'},{match_ended_at:'2026-09-15T00:00:00Z'},{video_started_at:'2026-09-17T00:00:00Z'}]) assert.equal(youtubeReplay({...game,...extra}),null);
});
const youtubeSource=await readFile(new URL('../../supabase/functions/_shared/youtube.ts',import.meta.url),'utf8');
const {youtubeId,refreshYoutubeRecording}=await import(compile(youtubeSource));
test('video ids only resolve concrete YouTube videos',()=>{
 assert.equal(youtubeId('https://www.youtube.com/live/abcdefghijk'),'abcdefghijk');
 assert.equal(youtubeId('https://youtu.be/abcdefghijk'),'abcdefghijk');
 assert.equal(youtubeId('https://youtube.com/@channel/live'),null);
 assert.equal(youtubeId('https://example.com/watch?v=abcdefghijk'),null);
});
test('automatic metadata uses actual start, caches it, and never overrides manual calibration',async()=>{
 const previous={Deno:globalThis.Deno,fetch:globalThis.fetch};
 let row=null,requests=0;
 globalThis.Deno={env:{get:()=> 'test-api-key'}};
 globalThis.fetch=async()=>{requests++;return {ok:true,json:async()=>({items:[{liveStreamingDetails:{actualStartTime:'2026-01-01T09:00:00Z'}}]})}};
 const client={from(){const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:row}),single:async()=>({data:row}),upsert:async value=>{row=value;return {}},update:value=>{row={...row,...value};return query},then:resolve=>Promise.resolve({}).then(resolve)};return query;}};
 try {
  assert.equal((await refreshYoutubeRecording(client,'t','abcdefghijk')).started_at,'2026-01-01T09:00:00Z');
  await refreshYoutubeRecording(client,'t','abcdefghijk');assert.equal(requests,1);
  row.manual_start=true;row.started_at='2026-01-01T08:50:00Z';
  assert.equal((await refreshYoutubeRecording(client,'t','abcdefghijk',true)).started_at,row.started_at);assert.equal(requests,1);
  row=null;globalThis.Deno.env.get=()=>undefined;
  await assert.rejects(refreshYoutubeRecording(client,'t','abcdefghijk'),/Schlüssel fehlt/);
 }finally{Object.assign(globalThis,previous);}
});
