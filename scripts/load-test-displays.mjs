// Read-only test of the deployed display API. No score submissions or admin calls.
// SUPABASE_URL and SUPABASE_ANON_KEY must identify the intended public backend.
// Optional TOURNAMENT_ID; otherwise the oldest public tournament is used, like the UI.
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
const base = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
if (!base || !key) throw new Error('Set SUPABASE_URL and SUPABASE_ANON_KEY');
const gameFields = 'id,tournament_id,number,round,game_date,court,display_order,team_a,team_b,referee,result,winner_team,game_rating,set1_team_a,set1_team_b,set2_team_a,set2_team_b,set3_team_a,set3_team_b,completed,score_locked_by_device,display_state';
const tournamentFields = 'id,name,hvv_edit_url,hvv_public_url,hvv_turnier_id,hvv_veranstaltung_id,hvv_type,hvv_gender,tournament_date,location,token_base_url,courts,court_streams';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const observations = [];
let failures = 0;
let halted = false;
let activeStage = 'discovery';
async function read(table, params) {
  if (halted) throw new Error('Test stopped after repeated errors');
  const url = new URL(`${base}/rest/v1/${table}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const start = performance.now();
  let status = 0;
  let bytes = 0;
  let result;
  try {
    const response = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    status = response.status;
    const body = await response.text();
    bytes = Buffer.byteLength(body);
    if (!response.ok) throw new Error(`HTTP ${status}`);
    result = JSON.parse(body);
    return result;
  } catch (error) {
    failures++;
    if (failures >= 10) halted = true;
    throw error;
  } finally {
    observations.push({ stage: activeStage, table, status, ms: performance.now() - start, decodedBytes: bytes, rows: result?.length ?? 0, ok: result !== undefined });
  }
}
const tournaments = await read('public_tournaments', { select: 'id', order: 'created_at.asc' });
const tournamentId = process.env.TOURNAMENT_ID || tournaments[0]?.id;
if (!tournamentId) throw new Error('No public tournament found');
const initial = await read('public_games', { select: gameFields, tournament_id: `eq.${tournamentId}`, order: 'number.asc' });
const historyIds = (games) => games.filter((g) => !g.completed && (!(g.game_rating ?? '').trim() || g.game_rating.trim() === 'Normal') && g.score_locked_by_device).map((g) => g.id);
const fixture = { compactDisplay: true, games: initial.length, openGames: initial.filter((g) => !g.completed).length, liveHistoryGames: historyIds(initial).length };
console.log(JSON.stringify({ event: 'dataset', ...fixture }));
const percentile = (values, p) => values.length ? [...values].sort((a,b) => a-b)[Math.ceil(values.length*p)-1] : null;
function summarize(rows) {
  return { requests: rows.length, errors: rows.filter((r) => !r.ok).length, medianMs: percentile(rows.map((r) => r.ms), .5), p95Ms: percentile(rows.map((r) => r.ms), .95), maxMs: rows.length ? Math.max(...rows.map((r) => r.ms)) : null, decodedBytes: rows.reduce((sum,r) => sum+r.decodedBytes,0) };
}
const stages = [];
const plan = process.env.LOAD_TEST_50_ONLY === "1" ? [[50,120]] : [[1,15], [10,30], [25,30], [50,120]];
for (const [users, seconds] of plan) {
  if (halted) break;
  activeStage = `${users} viewers`;
  const start = performance.now();
  const deadline = start + seconds * 1000;
  const cycles = [];
  console.log(JSON.stringify({ event: 'stage-start', users, seconds }));
  const progress = setInterval(() => console.log(JSON.stringify({ event: 'progress', stage: activeStage, ...summarize(observations.filter((r) => r.stage === activeStage)) })), 30000);
  await Promise.all(Array.from({length: users}, async (_, index) => {
    // All viewers start within one second, also exercising an opening burst.
    await sleep(index * 1000 / users);
    let tournamentLoadedAt = -Infinity;
    while (performance.now() < deadline && !halted) {
      const cycleStart = performance.now();
      try {
        if (performance.now() - tournamentLoadedAt >= 60000) {
          await read('public_tournaments', { select: tournamentFields, id: `eq.${tournamentId}` });
          tournamentLoadedAt = performance.now();
        }
        const games = await read('public_games', { select: gameFields, tournament_id: `eq.${tournamentId}`, order: 'number.asc' });
        // The compact overview uses display_state; full histories are only for single-court pages.
        cycles.push(performance.now()-cycleStart);
      } catch { /* Recorded above; stop globally after ten errors. */ }
      await sleep(Math.max(0, Math.min(5000, deadline-performance.now())));
    }
  }));
  clearInterval(progress);
  const rows = observations.filter((r) => r.stage === activeStage);
  const elapsedSeconds = (performance.now()-start)/1000;
  const summary = { users, elapsedSeconds, ...summarize(rows), requestsPerSecond: rows.length/elapsedSeconds, cycleP95Ms: percentile(cycles,.95), cycles: cycles.length };
  stages.push(summary);
  console.log(JSON.stringify({ event: 'stage-complete', ...summary }));
}
const report = { measuredAt: new Date().toISOString(), scenario: 'Public courts overview; five seconds after completion, tournament cache 60 seconds; HTTP clients, no browser rendering or writes', fixture, halted, stages, observations };
await writeFile(process.env.LOAD_TEST_REPORT || '/private/tmp/courtboard-display-load-test.json', JSON.stringify(report, null, 2)+'\n');
console.log(JSON.stringify({ event: 'complete', halted, total: summarize(observations) }));
if (failures) process.exitCode = 1;
