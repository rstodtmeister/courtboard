import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const url = s => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(s, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const schemaUrl = url(await read('../../supabase/functions/_shared/score-session.ts'));
const patchUrl = url(await read('../src/scorePatch.ts'));
const logicUrl = url(await read('../src/scoreLogic.ts'));
const sessionUrl = url((await read('../src/scoreSession.ts')).replace('"../../supabase/functions/_shared/score-session"', JSON.stringify(schemaUrl)).replace('"./scoreLogic"',JSON.stringify(logicUrl)).replace('"./scorePatch"',JSON.stringify(patchUrl)));
const { serializeScoreSession, restoreScoreSession, resumeForGame } = await import(sessionUrl);
const { canAcceptPointInput, pointInputGuardMs } = await import(logicUrl);
const { parseScoreSession } = await import(schemaUrl);
const { validateScoreSubmission } = await import(url((await read('../../supabase/functions/_shared/score-validation.ts')).replace('"./score-session.ts"',JSON.stringify(schemaUrl))));
const baseDraft = {team_a:'A',team_b:'B',referee:'Ref',completed:false,game_rating:'Normal',set1_team_a:'8',set1_team_b:'6',set2_team_a:'',set2_team_b:'',set3_team_a:'',set3_team_b:'',point_history:JSON.stringify([{set:1,team:'A',scoreA:8,scoreB:6}])};
const state = () => ({gameId:'game',draft:{...baseDraft},workflowStep:'live',serverSetupStep:'serve-team',activeSet:1,servingTeam:'B',firstServerTeamA:'Müller 1',firstServerTeamB:'Ben',captainTeamA:'Müller 2',captainTeamB:'Bob',playerLabels:{A:['Müller 1','Müller 2'],B:null},sideChangeInterval:7,leftTeam:'B',setScore:{A:8,B:6},serverIndex:{A:1,B:0},serveCounts:{A:4,B:3},correctionMode:true,sideChangeAck:14,timeoutScore:{A:'8:6',B:null},activeTimeoutTeam:'A',timeoutEndsAt:30000,timeoutRemaining:30,finalEditing:false,pointHistory:[]});

test('one deliberate tap counts while an immediate duplicate tap is ignored', () => {
 assert.equal(canAcceptPointInput(null,1000),true);
 assert.equal(canAcceptPointInput(1000,1000+pointInputGuardMs-1),false);
 assert.equal(canAcceptPointInput(1000,1000+pointInputGuardMs),true);
});

test('fresh device restores complete live state and an elapsed timeout', () => {
 const before=state(); const draft={...before.draft,score_entry_state:serializeScoreSession(before)};
 const resumed=restoreScoreSession('game',draft,12000);
 assert.deepEqual(resumed,{...before,draft,timeoutRemaining:18});
 const expired=restoreScoreSession('game',draft,40000);
 assert.equal(expired.timeoutRemaining,0);assert.equal(expired.activeTimeoutTeam,null);assert.equal(expired.timeoutEndsAt,null);
 assert.deepEqual(expired.timeoutScore,before.timeoutScore);
});
test('authoritative device state takes precedence over a stale browser with the same score', () => {
 const before=state();before.activeTimeoutTeam=null;before.timeoutEndsAt=null;
 const game={id:'game',...before.draft,score_entry_state:serializeScoreSession(before)};
 const old={...before,servingTeam:'A',serverIndex:{A:0,B:1},leftTeam:'A'};
 assert.equal(resumeForGame(game,null,old).servingTeam,'B');
 assert.equal(resumeForGame(game,null,null).leftTeam,'B');
 const pending={...game,score_entry_state:serializeScoreSession({...before,leftTeam:'A'})};
 assert.equal(resumeForGame(game,pending,null).leftTeam,'A');
});
test('legacy local state is reused only for the same game and unchanged score', () => {
 const before=state();const game={id:'game',...before.draft};
 assert.ok(resumeForGame(game,null,before));
 assert.equal(resumeForGame({...game,set1_team_a:'9'},null,before),null);
 assert.equal(resumeForGame({...game,id:'other'},null,before),null);
 assert.equal(resumeForGame({...game,team_a:'Changed team'},null,before),null);
 assert.equal(resumeForGame({...game,completed:true},null,before),null);
});
test('undo retains exact scores, service rotation, side and rolling history across devices', () => {
 const before=state();
 const history=Array.from({length:120},(_,i)=>({set:1,team:'A',scoreA:i%99,scoreB:0}));
 const previous={...baseDraft,set1_team_a:'7',point_history:JSON.stringify(history)};
 before.draft.point_history=JSON.stringify([...history.slice(1),{set:1,team:'B',scoreA:8,scoreB:6}]);
 before.pointHistory=[{draft:previous,leftTeam:'A',setScore:{A:7,B:6},servingTeam:'A',serverIndex:{A:0,B:0},serveCounts:{A:3,B:3},sideChangeAck:7}];
 const encoded=serializeScoreSession(before);
 assert.ok(encoded.length<15000);
 const resumed=restoreScoreSession('game',{...before.draft,score_entry_state:encoded});
 const undo=resumed.pointHistory[0];
 assert.equal(undo.draft.set1_team_a,'7');assert.equal(undo.draft.point_history,previous.point_history);
 assert.equal(undo.leftTeam,'A');assert.deepEqual(undo.serverIndex,{A:0,B:0});assert.equal(undo.sideChangeAck,7);
 assert.equal(undo.draft.score_entry_state,null);
});
test('setup and second-set transitions also survive without a first point', () => {
 const before={...state(),activeSet:2,workflowStep:'servers',serverSetupStep:'team-b',servingTeam:'A',firstServerTeamB:'',sideChangeInterval:null,setScore:{A:0,B:0},pointHistory:[]};
 const draft={...before.draft,score_entry_state:serializeScoreSession(before)};
 assert.equal(restoreScoreSession('game',draft).serverSetupStep,'team-b');
 assert.equal(restoreScoreSession('game',draft).activeSet,2);
});
test('wire validation rejects inconsistent or malformed sessions and clears completed sessions', () => {
 const before=state();const encoded=serializeScoreSession(before);
 const input={referee:'Ref',set1TeamA:'8',set1TeamB:'6',completed:false,scoreEntryState:encoded};
 assert.equal(validateScoreSubmission(input,{team_a:'A',team_b:'B'}).scoreEntryState,encoded);
 assert.throws(()=>validateScoreSubmission({...input,set1TeamA:'9'},{team_a:'A',team_b:'B'}),/passen nicht/);
 assert.throws(()=>parseScoreSession('{'),/Ungültig/);
 assert.throws(()=>parseScoreSession(JSON.stringify({...JSON.parse(encoded),serverIndex:{A:2,B:0}})),/Ungültig/);
 assert.throws(()=>parseScoreSession(JSON.stringify({...JSON.parse(encoded),firstServerTeamA:''})),/Unvollständig/);
 assert.equal(validateScoreSubmission({...input,set1TeamA:'21',set1TeamB:'19',completed:true},{team_a:'A',team_b:'B'}).scoreEntryState,null);
});

test('legacy in-flight commands keep their validated payload for receipt replay', () => {
 const input={referee:'Ref',set1TeamA:'8',set1TeamB:'6',completed:false};
 const validated=validateScoreSubmission(input,{team_a:'A',team_b:'B'});
 assert.equal(Object.hasOwn(validated,'scoreEntryState'),false);
 assert.equal(validateScoreSubmission({...input,scoreEntryState:null},{team_a:'A',team_b:'B'}).scoreEntryState,null);
});

test('120 undo steps stay compact even when every history has rolled past 120 entries', () => {
 const before=state();
 const entries=Array.from({length:240},(_,i)=>({set:2,team:i%2?'A':'B',scoreA:i%99,scoreB:0}));
 before.draft.point_history=JSON.stringify(entries.slice(-120));
 before.pointHistory=Array.from({length:120},(_,i)=>({
  draft:{...baseDraft,point_history:JSON.stringify(entries.slice(i,i+120))},
  leftTeam:'A',setScore:{A:8,B:6},servingTeam:'B',serverIndex:{A:1,B:0},serveCounts:{A:4,B:3},sideChangeAck:null,
 }));
 const encoded=serializeScoreSession(before);
 assert.ok(encoded.length<60000,`Unexpected size: ${encoded.length}`);
 const restored=restoreScoreSession('game',{...before.draft,score_entry_state:encoded});
 assert.deepEqual(restored.pointHistory.map(s=>s.draft.point_history),before.pointHistory.map(s=>s.draft.point_history));
});

test('client capture times survive validation and reject malformed or reversed times',()=>{
 const capture={matchStartedAt:'2026-01-01T09:00:00Z',matchEndedAt:'2026-01-01T09:30:00Z',matchVideoId:'abcdefghijk'};
 const validated=validateScoreSubmission(capture,{team_a:'A',team_b:'B'});
 for(const key of Object.keys(capture))assert.equal(validated[key],capture[key]);
 assert.throws(()=>validateScoreSubmission({...capture,matchStartedAt:'bad'},{team_a:'A',team_b:'B'}));
 assert.throws(()=>validateScoreSubmission({...capture,matchEndedAt:'2025-12-31T00:00:00Z'},{team_a:'A',team_b:'B'}));
 assert.throws(()=>validateScoreSubmission({...capture,matchVideoId:'https://bad.test'},{team_a:'A',team_b:'B'}));
});
