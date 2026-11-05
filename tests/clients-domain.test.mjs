import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeClient,clientStatuses} from '../platform/clients-domain.mjs';

test('client registry normalizes email, phone and name',()=>{
 const client=normalizeClient({name:'  Cliente Noroeste ',email:' VENTAS@EJEMPLO.MX ',phone:' +52 844 123 4567 ',company:' Socio Comercial ',status:'active',notes:'Primer contacto'});
 assert.deepEqual({name:client.name,email:client.email,phone:client.phone,company:client.company,status:client.status},
 {name:'Cliente Noroeste',email:'ventas@ejemplo.mx',phone:'+52 844 123 4567',company:'Socio Comercial',status:'active'});
 assert.deepEqual(clientStatuses,['prospect','active','inactive']);
});
test('client registry accepts contacts without email but rejects empty names and invalid input',()=>{
 const x=normalizeClient({name:'Prospecto',phone:'844-222-3333'});
 assert.equal(x.email,'');
 assert.equal(x.status,'prospect');
 assert.throws(()=>normalizeClient({name:''}),/Invalid client/);
 assert.throws(()=>normalizeClient({name:'Juan',email:'not-an-email'}),/Invalid client/);
 assert.throws(()=>normalizeClient({name:'Juan',status:'admin'}),/Invalid client/);
 assert.throws(()=>normalizeClient({name:'Juan',phone:'DROP TABLE clientes'}),/Invalid client/);
 assert.throws(()=>normalizeClient({name:'Juan',notes:'a'.repeat(2001)}),/Invalid client/);
});
