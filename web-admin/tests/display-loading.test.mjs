import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const moduleUrl = (source) => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64');
const { startDisplayPolling } = await import(moduleUrl(await readFile(new URL('../src/displayPolling.ts', import.meta.url), 'utf8')));
const flush = () => new Promise(setImmediate);

test('display polling pauses while hidden, refreshes on return, serializes and retries failures', async () => {
  const original = { document: globalThis.document, setTimeout, clearTimeout };
  let listener;
  const delays = [];
  const timers = new Map();
  globalThis.document = { visibilityState: 'hidden', addEventListener: (_, fn) => { listener = fn; }, removeEventListener: () => { listener = null; } };
  globalThis.setTimeout = (fn, delay) => { delays.push(delay); const id = {}; timers.set(id, fn); return id; };
  globalThis.clearTimeout = (id) => timers.delete(id);
  const pending = [];
  const errors = [];
  let stop;
  try {
    stop = startDisplayPolling(() => new Promise((resolve, reject) => pending.push({ resolve, reject })), (e) => errors.push(e));
    assert.equal(pending.length, 0);
    document.visibilityState = 'visible'; listener(); listener();
    assert.equal(pending.length, 1);
    pending[0].resolve(); await flush();
    assert.equal(timers.size, 1);
    document.visibilityState = 'hidden'; listener(); assert.equal(timers.size, 0);
    document.visibilityState = 'visible'; listener();
    assert.equal(pending.length, 2);
    pending[1].reject(new Error('offline')); await flush();
    assert.equal(errors.length, 1); assert.equal(timers.size, 1); assert.deepEqual(delays, [5000, 10000]);
    const retry = [...timers.values()][0]; timers.clear(); retry();
    assert.equal(pending.length, 3);
    stop(); pending[2].resolve(); await flush();
    assert.equal(timers.size, 0); assert.equal(listener, null);
  } finally { stop?.(); Object.assign(globalThis, original); }
});

const source = await readFile(new URL('../src/dataApiGames.ts', import.meta.url), 'utf8');
const displayFunction = source.slice(source.indexOf('export async function listDisplayGames'), source.indexOf('export async function syncGamesFromHvv'));
const { listDisplayGames } = await import(moduleUrl('const dataMode="supabase"; const getSupabase=()=>globalThis.__displayDb;\n' + displayFunction));
test('display queries filter courts, omit bulk histories and fetch only unfinished live histories', async () => {
  const calls = [];
  const rows = [
    { id: 'live', completed: false, game_rating: 'Normal', score_locked_by_device: 'device' },
    { id: 'done', completed: true, score_locked_by_device: 'device' },
    { id: 'future', completed: false },
  ];
  globalThis.__displayDb = { from: (table) => {
    const call = { table }; calls.push(call);
    const query = {
      select: (fields) => { call.fields = fields; return query; },
      eq: (key, value) => { call[key] = value; return query; },
      in: (key, value) => { call[key] = value; return query; },
      order: () => query,
      then: (resolve) => Promise.resolve({ data: call.fields === 'id,point_history' ? [{ id: 'live', point_history: 'history' }] : rows, error: null }).then(resolve),
    }; return query;
  } };
  try {
    const games = await listDisplayGames('t');
    assert.equal(calls[0].fields.includes('point_history'), false);
    assert.equal(calls[0].fields.includes('dirty'), false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].fields.includes('display_state'), true);
    assert.equal(games[0].point_history, undefined);
    calls.length = 0;
    await listDisplayGames('t', undefined, true);
    assert.equal(calls.length, 1);
    calls.length = 0;
    await listDisplayGames('t', ['1', '01']);
    assert.deepEqual(calls[0].court, ['1', '01']);
    assert.equal(calls[0].tournament_id, 't');
    assert.deepEqual(calls[1].id, ['live', 'future']);
  } finally { delete globalThis.__displayDb; }
});
