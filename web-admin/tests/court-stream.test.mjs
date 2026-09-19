import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source=await readFile(new URL('../src/stream.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {courtStreamButtonState}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('court stream actions reflect saved and edited links',()=>{
 const youtube='https://www.youtube.com/watch?v=abcdefghijk';
 const twitch='https://www.twitch.tv/courtboard';

 assert.deepEqual(courtStreamButtonState('', ''),{canSave:false,canRemove:false});
 assert.deepEqual(courtStreamButtonState('', youtube),{canSave:true,canRemove:false});
 assert.deepEqual(courtStreamButtonState(youtube, youtube),{canSave:false,canRemove:true});
 assert.deepEqual(courtStreamButtonState(youtube, twitch),{canSave:true,canRemove:true});
 assert.deepEqual(courtStreamButtonState(youtube, ''),{canSave:false,canRemove:true});
});
