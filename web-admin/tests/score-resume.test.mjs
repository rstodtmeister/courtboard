import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/ScoreEntryApp.tsx', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('  async function confirmReferee('), source.indexOf('  function startCurrentSet('));
const compiled = ts.transpileModule(handler, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

for (const scenario of ['resume', 'new', 'other-game', 'manual']) {
  test(`referee confirmation: ${scenario}`, async () => {
    const calls = {};
    const saved = { gameId: scenario === 'other-game' ? 'other' : 'game', draft: { set1_team_a: '12' }, workflowStep: 'live', servingTeam: 'B', firstServerTeamA: 'Anna', firstServerTeamB: 'Ben', serverIndex: { A: 1, B: 0 } };
    const context = {
      serializeScoreSession: () => "saved-session",
      selectedGame: { id: 'game' }, draft: { set1_team_a: '10' },
      resumeState: scenario === 'new' ? null : saved, token: 'token',
      submitScore: async (_token, _game, draft) => { calls.submitted = draft; },
      setSaving: () => {}, setError: () => {}, setDraft: () => {}, setData: () => {},
      setFinalEditing: value => { calls.manual = value; },
      setWorkflowStep: value => { calls.step = value; },
      resumeLastEntry: state => { calls.resumed = state; },
    };
    const confirm = new Function(...Object.keys(context), `${compiled}; return confirmReferee;`)(...Object.values(context));
    await confirm(scenario === 'manual' ? '' : 'Referee');
    if (scenario === 'resume') {
      assert.deepEqual(calls.resumed, { ...saved, draft: { ...saved.draft, referee: 'Referee', score_entry_state: 'saved-session' } });
      assert.equal(calls.submitted.set1_team_a, '12');
      assert.equal(calls.step, undefined);
    } else {
      assert.equal(calls.resumed, undefined);
      assert.equal(calls.step, scenario === 'manual' ? 'scoring' : 'servers');
    }
  });
}
