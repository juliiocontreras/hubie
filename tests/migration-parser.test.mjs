import test from 'node:test';
import assert from 'node:assert/strict';
import {sqlStatements} from '../platform/migration-parser.mjs';

test('SQL migration ignores comment semicolons before splitting statements',()=>{
 const sql='-- 011; comentario\nCREATE TABLE IF NOT EXISTS sample(id TEXT);\n-- nota; otra\nCREATE INDEX IF NOT EXISTS idx_sample ON sample(id);';
 assert.deepEqual(sqlStatements(sql),['CREATE TABLE IF NOT EXISTS sample(id TEXT)','CREATE INDEX IF NOT EXISTS idx_sample ON sample(id)']);
});
test('SQL migration ignores blank lines and comment-only statements',()=>{
 assert.deepEqual(sqlStatements('-- only\n\n -- another; thing\n'),[]);
});
