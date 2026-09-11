import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const apiSource = await readFile(new URL('../src/dataApiScore.ts', import.meta.url), 'utf8');
const queueSource = await readFile(new URL('../src/scoreSaveQueue.ts', import.meta.url), 'utf8');
const asModule = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const queueUrl = asModule(compile(queueSource));
const flush = () => new Promise((resolve) => setImmediate(resolve));
let moduleId = 0;

async function setup(mode) {
  const state = { mode, deviceId: 'referee-a', calls: [] };
  state.request = (path, options) => new Promise((resolve, reject) => {
    state.calls.push({
      path,
      body: typeof options.body === 'string' ? JSON.parse(options.body) : options.body,
      succeed: () => resolve(mode === 'local' ? { ok: true } : { error: null }),
      fail: () => mode === 'local'
        ? reject(new Error('Connection lost'))
        : resolve({ error: new Error('Connection lost') }),
    });
  });
  globalThis.__scoreSaveTest = state;
  const coreUrl = asModule(`
    const state = globalThis.__scoreSaveTest;
    export const dataMode = state.mode;
    export const getSupabase = () => ({ functions: { invoke: state.request } });
    export const localJson = state.request;
    export const localAdminJson = state.request;
    export const scoreDeviceId = () => state.deviceId;
    export const supabaseFunctionErrorMessage = async (error) => error.message;
    // Separate module instances, including their queues, for each test.
    // ${++moduleId}
  `);
  const tournamentsUrl = asModule('export const getPrimaryTournament = () => { throw new Error("Unexpected tournament lookup"); };');
  const outboxUrl = asModule('export const createScoreOutbox = () => ({}); export class ScoreTransportError extends Error {}');
  const logicUrl = asModule('export const draftFromGame = game => game;');
  const code = compile(apiSource)
    .replace('"./dataApiCore"', JSON.stringify(coreUrl))
    .replace('"./dataApiTournaments"', JSON.stringify(tournamentsUrl))
    .replace('"./scoreSaveQueue"', JSON.stringify(queueUrl))
    .replace('"./scoreOutbox"', JSON.stringify(outboxUrl))
    .replace('"./scoreLogic"', JSON.stringify(logicUrl));
  return { state, api: await import(asModule(code)) };
}

const game = { id: 'game-1', tournament_id: 'tournament-1' };
const score = (points, completed = false) => ({
  set1_team_a: String(points), set1_team_b: '6',
  referee: 'Team C', completed, printed: false,
  point_history: JSON.stringify([{ set: 1, team: 'A', scoreA: points, scoreB: 6 }]),
});

for (const mode of ['local']) {
  test(`${mode}: rapid points, undo and final result reach the server in order`, async () => {
    const { state, api } = await setup(mode);
    const writes = [
      api.submitScore('court-link', game, score(7)),
      api.submitScore('court-link', game, score(8)),
      api.submitScore('court-link', game, score(7)),
      api.submitScore('court-link', game, score(7, true)),
    ];
    let finalConfirmed = false;
    writes[3].then(() => { finalConfirmed = true; });
    await flush();
    assert.equal(state.calls.length, 1, 'Only the first write may start before its response');
    for (let i = 0; i < writes.length; i++) {
      assert.equal(state.calls.length, i + 1);
      assert.equal(finalConfirmed, false);
      assert.equal(state.calls[i].body.set1TeamA, ['7', '8', '7', '7'][i]);
      assert.equal(state.calls[i].body.completed, i === 3);
      state.calls[i].succeed();
      await writes[i];
      await flush();
    }
    assert.equal(finalConfirmed, true);
  });

  test(`${mode}: four courts save independently while one court is slow`, async () => {
    const { state, api } = await setup(mode);
    const firstWrites = [1, 2, 3, 4].map((court) =>
      api.submitScore(`court-${court}`, { ...game, id: `game-${court}` }, score(court)));
    const nextOnFirstCourt = api.submitScore('court-1', game, score(5));
    await flush();
    assert.equal(state.calls.length, 4);
    for (const call of state.calls.slice(1)) call.succeed();
    await Promise.all(firstWrites.slice(1));
    assert.equal(state.calls.length, 4, 'Court 1 is still waiting; other courts finished');
    state.calls[0].succeed();
    await firstWrites[0];
    await flush();
    assert.equal(state.calls.length, 5);
    assert.equal(state.calls[4].body.gameId, 'game-1');
    state.calls[4].succeed();
    await nextOnFirstCourt;
  });

  test(`${mode}: a failed save reports its error without blocking or retrying older scores`, async () => {
    const { state, api } = await setup(mode);
    const failed = api.submitScore('court-link', game, score(7));
    const rejection = assert.rejects(failed, /Connection lost/);
    const latest = api.submitScore('court-link', game, score(8));
    await flush();
    state.calls[0].fail();
    await rejection;
    await flush();
    assert.equal(state.calls.length, 2);
    assert.equal(state.calls[1].body.set1TeamA, '8');
    state.calls[1].succeed();
    await latest;
    // A completely drained queue must accept another save, too.
    const following = api.submitScore('court-link', game, score(9));
    await flush();
    assert.equal(state.calls.length, 3);
    assert.equal(state.calls[2].body.set1TeamA, '9');
    state.calls[2].succeed();
    await following;
  });

  test(`${mode}: queued requests retain their original score, game and device`, async () => {
    const { state, api } = await setup(mode);
    const first = api.submitScore('court-link', game, score(7));
    const mutableGame = { ...game };
    const mutableScore = score(8);
    const second = api.submitScore('court-link', mutableGame, mutableScore);
    mutableGame.id = 'another-game';
    mutableScore.set1_team_a = '99';
    mutableScore.completed = true;
    state.deviceId = 'another-device';
    await flush();
    state.calls[0].succeed();
    await first;
    await flush();
    const payload = state.calls[1].body;
    assert.equal(payload.set1TeamA, '8');
    assert.equal(payload.completed, false);
    assert.equal(payload.gameId, 'game-1');
    assert.equal(payload.deviceId, 'referee-a');
    state.calls[1].succeed();
    await second;
  });
}

test('different links to the same game share one write queue', async () => {
  const { state, api } = await setup('local');
  const first = api.submitScore('court-link', game, score(7));
  const second = api.submitScore('individual-game-link', game, score(8));
  await flush();
  assert.equal(state.calls.length, 1);
  state.calls[0].succeed();
  await first;
  await flush();
  assert.equal(state.calls[1].body.token, 'individual-game-link');
  state.calls[1].succeed();
  await second;
});
