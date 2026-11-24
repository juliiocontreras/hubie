import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOrderCreate,normalizeDelivery,normalizeOrderInvoice,nextOrderStatus,formatOrderFolio} from '../platform/sales-orders-domain.mjs';

const uuid='11111111-1111-4111-8111-111111111111';

test('pedidos: crear solo pide la cotización aceptada',()=>{
 assert.deepEqual(normalizeOrderCreate({quoteId:uuid}),{quoteId:uuid});
 assert.throws(()=>normalizeOrderCreate({}),/Invalid order/);
 assert.throws(()=>normalizeOrderCreate({quoteId:'no-uuid'}),/Invalid order/);
 assert.throws(()=>normalizeOrderCreate({quoteId:uuid,extra:1}),/Invalid order/);
});

test('entrega: fecha, guía y paquetería con claves estrictas',()=>{
 assert.deepEqual(normalizeDelivery({deliveryDate:'2026-11-20',carrier:'Estafeta',trackingCode:'ABC123'}),
  {deliveryDate:'2026-11-20',carrier:'Estafeta',trackingCode:'ABC123'});
 assert.deepEqual(normalizeDelivery({}),{deliveryDate:null,carrier:'',trackingCode:''});
 assert.throws(()=>normalizeDelivery({deliveryDate:'20/11/2026'}),/Invalid/);
 assert.throws(()=>normalizeDelivery({carrier:'x'.repeat(81)}),/Invalid value/);
});

test('factura del pedido: RFC opcional con formato válido',()=>{
 assert.deepEqual(normalizeOrderInvoice({rfc:'abc123456t78',notes:'n'}),{rfc:'ABC123456T78',notes:'n'});
 assert.deepEqual(normalizeOrderInvoice({}),{rfc:'',notes:''});
 assert.throws(()=>normalizeOrderInvoice({rfc:'no-es-rfc'}),/Invalid invoice/);
});

test('transiciones de pedido: flujo lineal con cancelación, sin retorno',()=>{
 assert.equal(nextOrderStatus('borrador','confirmado'),'confirmado');
 assert.equal(nextOrderStatus('confirmado','en preparación'),'en preparación');
 assert.equal(nextOrderStatus('en preparación','enviado'),'enviado');
 assert.equal(nextOrderStatus('enviado','entregado'),'entregado');
 assert.equal(nextOrderStatus('enviado','cancelado'),'cancelado');
 assert.throws(()=>nextOrderStatus('borrador','enviado'),/Invalid order status/);
 assert.throws(()=>nextOrderStatus('entregado','enviado'),/Invalid order status/);
 assert.throws(()=>nextOrderStatus('cancelado','confirmado'),/Invalid order status/);
 assert.throws(()=>nextOrderStatus('confirmado','entregado'),/Invalid order status/);
 assert.equal(formatOrderFolio(12),'PV-0012');
});
