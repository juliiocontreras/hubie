import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root = new URL('../',import.meta.url);
const app = readFileSync(new URL('assets/app-console.js',root),'utf8');
const madre = readFileSync(new URL('assets/admin-console.js',root),'utf8');

test('every Suite navigation applies its tenant image backgrounds, not just colors',()=>{
 const calls=[...app.matchAll(/applyAppearance\(config\.appearance[^;]+;/g)].map(m=>m[0]);
 assert.ok(calls.length>=3);
 for(const call of calls)assert.match(call,/config\.backgrounds/);
});
test('Madre initial appearance uses saved image backgrounds',()=>{
 assert.match(madre,/themeUI\.applyAppearance\(state\.platformAppearance,document\.documentElement,state\.platformBackgrounds\)/);
});
