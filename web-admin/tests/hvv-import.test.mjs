import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../../supabase/functions/_shared/import-games.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { uniqueImportGames } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
test('repeated identical HVV rows import once, preserving distinct matches and order', () => {
 const a={number:'1',team_a:'A',team_b:'B'}, b={number:'2',team_a:'C',team_b:'D'};
 assert.deepEqual(uniqueImportGames([a,b,{...a,number:' 1 '}]),[a,b]);
});
test('different matches sharing a number are rejected without silently dropping a match', () => {
 assert.throws(()=>uniqueImportGames([{number:'1',team_a:'A'},{number:'1',team_a:'B'}]),/„1“.*unterschiedlichen/);
});
test('blank match numbers are rejected before database writes', () => {
 assert.throws(()=>uniqueImportGames([{number:' '}]),/keine Spielnummer/);
});
