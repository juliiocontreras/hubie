import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {suiteDistribution} from '../platform/suite-distribution.mjs';
const madre=readFileSync(new URL('../madre/app.html',import.meta.url),'utf8');
const suite=readFileSync(new URL('../app/index.html',import.meta.url),'utf8');
const madreSW=readFileSync(new URL('../madre/sw.js',import.meta.url),'utf8');
const clientSW=readFileSync(new URL('../app/sw.js',import.meta.url),'utf8');

test('Madre renders actual premium dashboard sections, not the old marketing-style hero',()=>{
 assert.match(madre,/Bienvenido a Hubie Madre/);
 assert.match(madre,/id="madre-suite-distribution"/);
 assert.match(madre,/id="madre-theme-quick"/);
 assert.doesNotMatch(madre,/Una sola plataforma\.\s*<br>Infinitas configuraciones/);
});
test('client dashboard gives CRM data visualization and own actual KPI cards without generic old hero',()=>{
 assert.match(suite,/id="home-pipeline-chart"/);
 assert.match(suite,/id="home-kpis"/);
 assert.match(suite,/id="home-quick-actions"/);
 assert.doesNotMatch(suite,/La operación de tu empresa en un solo lugar\./);
});
test('both service workers allow fresh page navigations and versioned styles',()=>{
 for(const source of [madreSW,clientSW]){
  assert.match(source,/e\.request\.mode==='navigate'/);
  assert.match(source,/pwa-(?:premium-v2|cases-v1)/);
 }
});
test('suite distribution uses actual tenant counts and omits invented series',()=>{
 const result=suiteDistribution([{suiteId:'S001'},{suiteId:'S002'},{suiteId:'S001'},{suiteId:'S001'}],new Map([['S001','Comercio'],['S002','Salud']]));
 assert.deepEqual(result.map(x=>[x.name,x.count]),[['Comercio',3],['Salud',1]]);
 assert.deepEqual(suiteDistribution([],new Map()),[]);
});
