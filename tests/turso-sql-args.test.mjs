import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeSqlArg} from '../database.mjs';
test('Turso pipeline preserves SQL NULL instead of storing empty strings',()=>{
 assert.deepEqual(encodeSqlArg(null),{type:'null'});
 assert.deepEqual(encodeSqlArg(undefined),{type:'null'});
 assert.deepEqual(encodeSqlArg(''),{type:'text',value:''});
 assert.deepEqual(encodeSqlArg('hello'),{type:'text',value:'hello'});
});
test('Turso pipeline keeps integer, decimal and boolean bind types',()=>{
 assert.deepEqual(encodeSqlArg(0),{type:'integer',value:'0'});
 assert.deepEqual(encodeSqlArg(-3),{type:'integer',value:'-3'});
 assert.deepEqual(encodeSqlArg(145000),{type:'integer',value:'145000'});
 assert.deepEqual(encodeSqlArg(2.75),{type:'float',value:2.75});
 assert.deepEqual(encodeSqlArg(true),{type:'integer',value:'1'});
 assert.deepEqual(encodeSqlArg(false),{type:'integer',value:'0'});
 assert.throws(()=>encodeSqlArg(Number.POSITIVE_INFINITY),/Unsupported SQL value/);
 assert.throws(()=>encodeSqlArg({a:1}),/Unsupported SQL value/);
});
