import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/dataApiAuth.ts', import.meta.url), 'utf8');
let moduleId = 0;
async function setup() {
  const storage = new Map();
  const browser = new EventTarget();
  browser.sessionStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  browser.setTimeout = setTimeout;
  browser.clearTimeout = clearTimeout;
  globalThis.window = browser;
  const state = {
    session: { access_token: 'device-a', user: { id: 'user-1', email: 'admin@example.test' } },
    status: 'superadmin',
    signOutCalls: [],
    rpcCalls: [],
    clearedCredentials: false,
    rpc: async () => ({ data: state.status, error: null }),
  };
  state.client = {
    auth: {
      getSession: async () => ({ data: { session: state.session }, error: null }),
      signOut: async (options) => { state.signOutCalls.push(options); return { error: null }; },
      onAuthStateChange: (callback) => {
        state.authCallback = callback;
        return { data: { subscription: { unsubscribe: () => { state.unsubscribed = true; } } } };
      },
    },
    rpc: async (name) => { state.rpcCalls.push(name); return state.rpc(); },
  };
  globalThis.__sessionTest = state;
  const mock = `
    const state = globalThis.__sessionTest;
    export const dataMode = 'supabase';
    export const getSupabase = () => state.client;
    export const clearHvvCredentials = () => { state.clearedCredentials = true; };
    export const updateStore = () => {};
    export const readStore = () => ({});
  `;
  const mockUrl = 'data:text/javascript;base64,' + Buffer.from(mock + `\n// ${++moduleId}`).toString('base64');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const code = outputText.replace('"./dataApiCore"', JSON.stringify(mockUrl));
  const api = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  return { state, api };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

test('login claims the session before exposing the dashboard identity', async () => {
  const { state, api } = await setup();
  assert.deepEqual(await api.getSession(), { user: { email: 'admin@example.test', role: 'superadmin' } });
  assert.deepEqual(state.rpcCalls, ['claim_admin_session']);
  assert.equal(state.signOutCalls.length, 0);
});

test('replaced session is signed out locally and shows the takeover notice', async () => {
  const { state, api } = await setup();
  state.status = 'replaced';
  let ended = false;
  window.addEventListener('courtboard:session-ended', () => { ended = true; });
  assert.equal(await api.validateAdminSession(), false);
  assert.deepEqual(state.signOutCalls, [{ scope: 'local' }]);
  assert.equal(state.clearedCredentials, true);
  assert.equal(ended, true);
  assert.match(api.getSessionNotice(), /anderen Gerät/);
});

test('reloading a replaced session does not expose an admin identity', async () => {
  const { state, api } = await setup();
  state.status = 'replaced';
  assert.equal(await api.getSession(), null);
  assert.deepEqual(state.signOutCalls, [{ scope: 'local' }]);
});

test('network failures do not masquerade as a takeover or sign out other devices', async () => {
  const { state, api } = await setup();
  state.rpc = async () => ({ data: null, error: { message: 'Network unavailable' } });
  await assert.rejects(api.validateAdminSession(), /Network unavailable/);
  assert.equal(state.signOutCalls.length, 0);
  assert.equal(api.getSessionNotice(), '');
});

test('a late response for an older token cannot sign out a newer local login', async () => {
  const { state, api } = await setup();
  state.rpc = async () => {
    state.session = { ...state.session, access_token: 'new-local-login' };
    return { data: 'replaced', error: null };
  };
  assert.equal(await api.validateAdminSession(), false);
  assert.equal(state.signOutCalls.length, 0);
  assert.equal(api.getSessionNotice(), '');
});

test('Auth callbacks defer API work, and unsubscribing cancels pending work', async () => {
  const { state, api } = await setup();
  const sessions = [];
  const unsubscribe = api.onSessionChange((session) => sessions.push(session), assert.fail);
  state.authCallback('INITIAL_SESSION', state.session);
  assert.equal(state.rpcCalls.length, 0, 'No Supabase request inside the Auth callback');
  await tick();
  assert.equal(sessions[0].user.role, 'superadmin');
  state.authCallback('TOKEN_REFRESHED', state.session);
  unsubscribe();
  await tick();
  assert.equal(state.rpcCalls.length, 1);
  assert.equal(state.unsubscribed, true);
});

test('ordinary admins retain their identity', async () => {
  const { state, api } = await setup();
  state.status = 'admin';
  assert.equal((await api.getSession()).user.role, 'admin');
  assert.equal(await api.validateAdminSession(), true);
  assert.equal(state.signOutCalls.length, 0);
});

test('manual logout only revokes the current session', async () => {
  const { state, api } = await setup();
  await api.signOut();
  assert.deepEqual(state.signOutCalls, [{ scope: 'local' }]);
});
