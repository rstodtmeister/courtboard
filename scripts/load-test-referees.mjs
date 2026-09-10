// Only run against disposable fixtures created for this test. Never completes a match.
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import ts from '../web-admin/node_modules/typescript/lib/typescript.js';
const fixture = JSON.parse(await readFile(process.env.LOAD_TEST_FIXTURE, 'utf8'));
if (fixture.purpose !== 'courtboard-disposable-load-test' || fixture.games.length !== 4) throw new Error('Invalid disposable fixture');
const queueSource = await readFile(new URL('../web-admin/src/scoreSaveQueue.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(queueSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { createScoreSaveQueue } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const enqueue = createScoreSaveQueue();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const observations = [];
let failures = 0;
let stage = 'baseline';
const states = fixture.games.map((game, i) => ({ ...game, deviceId: `load-test-${fixture.tournamentId}-${i}`, history: [], a: 0, b: 0, moves: 0, lastHeartbeat: performance.now(), expected: null }));
async function submit(state, body, kind = 'score') {
  const started = performance.now();
  let ok = false, status = 0;
  try {
    const response = await fetch(`${process.env.SUPABASE_URL}/functions/v1/submit-score`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: process.env.SUPABASE_ANON_KEY },
      body: JSON.stringify({ token: state.token, deviceId: state.deviceId, gameId: state.id, ...body }),
      signal: AbortSignal.timeout(15000),
    });
    status = response.status;
    const result = await response.json();
    if (!response.ok || result.ok !== true) throw new Error(`Submit failed: HTTP ${status}`);
    ok = true;
  } catch (error) { failures++; throw error; }
  finally { observations.push({ stage, court: state.court, kind, status, ok, ms: performance.now()-started }); }
}
function nextScore(state) {
  state.moves++;
  if (state.moves % 10 === 0 && state.history.length) {
    state.history.pop();
    state.a = state.history.at(-1)?.scoreA ?? 0;
    state.b = state.history.at(-1)?.scoreB ?? 0;
  } else {
    const team = state.history.length % 2 === 0 ? 'A' : 'B';
    if (team === 'A') state.a++; else state.b++;
    state.history.push({ set: 1, team, scoreA: state.a, scoreB: state.b });
  }
  return { referee: `Lasttest Court ${state.court}`, gameRating: 'Normal', set1TeamA: String(state.a), set1TeamB: String(state.b), set2TeamA: '', set2TeamB: '', set3TeamA: '', set3TeamB: '', completed: false, pointHistory: JSON.stringify(state.history) };
}
const percentile = (values,p) => values.length ? [...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1] : null;
function summary(rows) {
  return { requests: rows.length, errors: rows.filter((r)=>!r.ok).length, medianMs: percentile(rows.map((r)=>r.ms),.5), p95Ms: percentile(rows.map((r)=>r.ms),.95), maxMs: rows.length ? Math.max(...rows.map((r)=>r.ms)) : null };
}
async function runWriters(seconds) {
  const deadline = performance.now() + seconds*1000;
  await Promise.all(states.map(async (state) => {
    while (performance.now() < deadline && failures < 5) {
      const start = performance.now();
      const payload = nextScore(state);
      try {
        await enqueue(state.id, () => submit(state, payload));
        state.expected = payload;
        if (performance.now()-state.lastHeartbeat >= 60000) {
          await submit(state, { action: 'heartbeat' }, 'heartbeat');
          state.lastHeartbeat = performance.now();
        }
      } catch { /* Stop new writes after five errors; never retry an old snapshot. */ }
      await sleep(Math.max(0, Math.min(2000-(performance.now()-start), deadline-performance.now())));
    }
  }));
}
console.log(JSON.stringify({ event: 'baseline-start', referees: 4, seconds: 30 }));
await runWriters(30);
console.log(JSON.stringify({ event: 'baseline-complete', ...summary(observations) }));
if (failures) throw new Error('Baseline failed; skipping combined test');
stage = '50 viewers + 4 referees';
console.log(JSON.stringify({ event: 'combined-start', seconds: 120 }));
const viewers = spawn(process.execPath, ['scripts/load-test-displays.mjs'], { env: { ...process.env, TOURNAMENT_ID: fixture.tournamentId, LOAD_TEST_50_ONLY: '1', LOAD_TEST_REPORT: '/private/tmp/courtboard-combined-viewers.json' }, stdio: 'inherit' });
const viewerDone = new Promise((resolve,reject) => { viewers.on('error',reject); viewers.on('exit',code=>resolve(code)); });
const progress = setInterval(()=>console.log(JSON.stringify({ event: 'writer-progress', ...summary(observations.filter((r)=>r.stage===stage)) })),30000);
let viewerCode;
try { [,viewerCode] = await Promise.all([runWriters(120), viewerDone]); }
finally { clearInterval(progress); }
const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/public_games?select=id,set1_team_a,set1_team_b,point_history,completed&tournament_id=eq.${fixture.tournamentId}`, { headers: { apikey: process.env.SUPABASE_ANON_KEY }, signal: AbortSignal.timeout(10000) });
if (!response.ok) throw new Error('Final verification read failed');
const stored = await response.json();
const checks = states.map((state) => {
  const actual = stored.find((game)=>game.id===state.id);
  const expected = state.expected;
  return { court: state.court, moves: state.moves, score: `${state.a}:${state.b}`, historyEntries: state.history.length, matches: !!actual && actual.set1_team_a===expected.set1TeamA && actual.set1_team_b===expected.set1TeamB && JSON.stringify(JSON.parse(actual.point_history))===expected.pointHistory && actual.completed===false };
});
const report = { measuredAt: new Date().toISOString(), scenario: 'Four serial score writers, one change per two seconds, every tenth change undo; 30 seconds baseline then 120 seconds alongside 50 viewers; no match completion', baseline: summary(observations.filter((r)=>r.stage==='baseline')), combined: summary(observations.filter((r)=>r.stage!=='baseline' && r.kind==='score')), heartbeats: summary(observations.filter((r)=>r.kind==='heartbeat')), checks, viewerCode, observations };
await writeFile('/private/tmp/courtboard-combined-referees.json', JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ event: 'writers-complete', ...report, observations: undefined }));
if (failures || viewerCode !== 0 || checks.some((check)=>!check.matches)) process.exitCode=1;
