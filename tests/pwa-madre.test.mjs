import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog, getSuite, getTool, normalizeTenantInput, resolveEnabledTools, validateRecord } from '../platform/catalog.mjs';

test('la PWA Madre usa las diez suites y treinta tools del catálogo comercial existente', () => {
 assert.equal(catalog.suites.length, 10);
 assert.equal(catalog.tools.length, 30);
 assert.equal(getSuite('S001').price, 9900);
 assert.equal(getTool('T015').price, 6100);
 assert.equal(catalog.rules.monthlyPlatformFee, 0);
});

test('cada empresa hereda las tools Core y puede personalizar herramientas opcionales', () => {
 const input = normalizeTenantInput({ name:'Empresa Uno', slug:'empresa-uno', suiteId:'S001', toolIds:['C001','T004','T015'], primaryColor:'#cc3344' });
 assert.equal(input.name,'Empresa Uno');
 const states=resolveEnabledTools(input.toolIds);
 assert.equal(states.find(x=>x.toolId==='T015').enabled, 1);
 assert.equal(states.find(x=>x.toolId==='C002').enabled, 0);
 assert.equal(states.length, catalog.tools.length);
});

test('la activación automática utiliza el Core si no se envían herramientas personalizadas', () => {
 const input=normalizeTenantInput({name:'Empresa Dos',slug:'empresa-dos',suiteId:'S002'});
 assert.equal(input.toolIds.length, 10);
 assert.ok(input.toolIds.includes('C001'));
 assert.ok(!input.toolIds.includes('T015'));
});

test('se rechazan ids desconocidos, nombres y colores inválidos', () => {
 assert.throws(()=>normalizeTenantInput({name:'X',slug:'x',suiteId:'S001'}),/Invalid tenant data/);
 assert.throws(()=>normalizeTenantInput({name:'Empresa Tres',slug:'empresa-tres',suiteId:'S999'}),/Invalid tenant data/);
 assert.throws(()=>normalizeTenantInput({name:'Empresa Tres',slug:'empresa-tres',suiteId:'S001',toolIds:['T999']}),/Invalid tenant data/);
 assert.throws(()=>normalizeTenantInput({name:'Empresa Tres',slug:'empresa-tres',suiteId:'S001',primaryColor:'red'}),/Invalid tenant data/);
});

test('los registros operativos no aceptan claves ni tamaños arbitrarios', () => {
 const clean=validateRecord({title:'  Cliente A  ',status:'active',fields:{email:'a@ejemplo.com',telefono:'8441234567'}});
 assert.equal(clean.title,'Cliente A');
 assert.equal(clean.fields.email,'a@ejemplo.com');
 assert.throws(()=>validateRecord({title:'',fields:{}}),/Invalid record/);
 assert.throws(()=>validateRecord({title:'Cliente',fields:{'__proto__':'x',nested:{foo:'bar'}}}),/Invalid record/);
});
