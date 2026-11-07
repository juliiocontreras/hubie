import test from 'node:test';
import assert from 'node:assert/strict';
import {databaseProtocol,convertTursoResult} from '../database.mjs';

test('new Turso Cloud URLs use its serverless SDK; legacy libSQL stays on Hrana',()=>{
 assert.equal(databaseProtocol('turso://hubie-staging.example.turso.io'),'turso');
 assert.equal(databaseProtocol('libsql://old-instance.example.turso.io'),'libsql');
 assert.equal(databaseProtocol('https://old-instance.example.turso.io'),'libsql');
 assert.throws(()=>databaseProtocol('file:local.db'),/Unsupported Turso database protocol/);
});
test('new Turso result adapts to legacy Hubie SQL row value contract',()=>{
 const result=convertTursoResult({
  columns:['id','amount','optional','active'],
  rows:[['doc-1',1200,null,1]],
  rowsAffected:1
 });
 assert.deepEqual(result.rows,[[{value:'doc-1'},{value:1200},{value:null},{value:1}]]);
 assert.equal(result.rowsAffected,1);
 assert.equal(result.affected_row_count,1);
});
