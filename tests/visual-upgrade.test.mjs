import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('catalog UI explicitly lists all included Core tools and provides reduced-motion support',async()=>{
 const js=await readFile('assets/catalog-ui.js','utf8');
 const css=await readFile('assets/navigation.css','utf8');
 assert.match(js,/catalog\.tools\.filter\(t=>t\.included\)/);
 assert.match(js,/hubie-core-list/);
 assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
 assert.match(css,/hubie-ambient/);
});
