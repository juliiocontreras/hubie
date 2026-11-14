import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256Hex,normalizePortalEmail,normalizePortalPassword,portalTokenState,portalTokenExpiredAt,normalizePortalRequest,nextPortalRequestStatus,normalizeLoyaltyConfig,earnPointsForPayment,redeemValueCents,normalizeLoyaltyRedeem,loyaltyBalance,normalizeKanbanBoard,normalizeKanbanPhase,normalizeKanbanCard,kanbanMoveAllowed,normalizeSignature,SIGNATURE_DISCLAIMER,SIGNATURE_CONSENT_TEXT,SIGNATURE_MAX_BYTES,normalizeLot,lotExpiryStatus,normalizeLotAdjustment,normalizeScanCode,scannerSupport,resolveScanCode,normalizeCommissionRule,resolveCommissionRule,commissionForPayment,summarizeCommissions,commissionPeriod,PORTAL_TOKEN_TTL_HOURS,PORTAL_PASSWORD_MIN_LENGTH} from '../platform/tools-p2-domain.mjs';

const png=()=>{const head=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);const body=Buffer.alloc(200,7);return 'data:image/png;base64,'+Buffer.concat([head,body]).toString('base64');};
const uuid='123e4567-e89b-42d3-a456-426614174000';

// T001 portal
test('T001: email y contraseña del portal se validan',()=>{
 assert.equal(normalizePortalEmail(' Cliente@Ejemplo.mx '),'cliente@ejemplo.mx');
 assert.throws(()=>normalizePortalEmail('no-es-correo'),/Invalid portal email/);
 assert.equal(normalizePortalPassword('secreta1234'),'secreta1234');
 assert.throws(()=>normalizePortalPassword('corta1'),/Invalid portal password/);
 assert.throws(()=>normalizePortalPassword('sinnumeroslargos'),/Invalid portal password/);
 assert.equal(PORTAL_PASSWORD_MIN_LENGTH,10);
});
test('T001: token de activación 24 h, un solo uso, con estados claros',()=>{
 assert.equal(PORTAL_TOKEN_TTL_HOURS,24);
 const hash=sha256Hex('token-secreto');
 assert.equal(sha256Hex('token-secreto'),hash);
 assert.notEqual(sha256Hex('otro'),hash);
 const base={tokenHash:hash,expiresAt:new Date(Date.now()+3600000).toISOString(),consumedAt:null};
 assert.deepEqual(portalTokenState(base),{valid:true});
 assert.deepEqual(portalTokenState({...base,consumedAt:new Date().toISOString()}),{valid:false,reason:'consumed'});
 assert.deepEqual(portalTokenState({...base,expiresAt:new Date(Date.now()-1000).toISOString()}),{valid:false,reason:'expired'});
 assert.deepEqual(portalTokenState({tokenHash:null}),{valid:false,reason:'not_found'});
 const expires=portalTokenExpiredAt(new Date('2026-11-13T12:00:00Z'));
 assert.equal(expires,'2026-11-14T12:00:00.000Z');
});
test('T001: solicitud del portal y sus estados',()=>{
 assert.deepEqual(normalizePortalRequest({subject:' Duda ',message:'¿Cuándo llega?'}),{subject:'Duda',message:'¿Cuándo llega?'});
 assert.throws(()=>normalizePortalRequest({subject:'x',message:'y'}),/Invalid portal request/);
 assert.equal(nextPortalRequestStatus('open','in_progress'),'in_progress');
 assert.equal(nextPortalRequestStatus('closed','open'),'open');
 assert.throws(()=>nextPortalRequestStatus('closed','in_progress'),/Invalid portal request status/);
});

// T002 lealtad
test('T002: puntos por cobro confirmado y valor de canje',()=>{
 assert.equal(earnPointsForPayment(105000,{pointsPerPeso:1,pointValueCents:10,minRedeemPoints:100,active:true}),1050);
 assert.equal(earnPointsForPayment(9999,{pointsPerPeso:2,pointValueCents:10,minRedeemPoints:100,active:true}),198);
 assert.equal(earnPointsForPayment(100000,{pointsPerPeso:1,pointValueCents:10,minRedeemPoints:100,active:false}),0);
 assert.equal(redeemValueCents(250,{pointsPerPeso:1,pointValueCents:10,minRedeemPoints:100,active:true}),2500);
 assert.throws(()=>earnPointsForPayment(0,{}),/Invalid loyalty earn/);
 assert.throws(()=>earnPointsForPayment(-5,{}),/Invalid loyalty earn/);
});
test('T002: canje exige mínimo y saldo suficiente',()=>{
 const cfg={pointsPerPeso:1,pointValueCents:10,minRedeemPoints:100,active:true};
 assert.deepEqual(normalizeLoyaltyRedeem({clientId:uuid,points:150,note:'Descuento'},{balancePoints:200,config:cfg}),{clientId:uuid,points:150,note:'Descuento',valueCents:1500});
 assert.throws(()=>normalizeLoyaltyRedeem({clientId:uuid,points:50},{balancePoints:200,config:cfg}),/Invalid loyalty redeem/);
 assert.throws(()=>normalizeLoyaltyRedeem({clientId:uuid,points:300},{balancePoints:200,config:cfg}),/Insufficient loyalty points/);
 assert.equal(loyaltyBalance([{deltaPoints:100},{deltaPoints:-30},{deltaPoints:5}]),75);
 assert.equal(loyaltyBalance([]),0);
 assert.throws(()=>normalizeLoyaltyConfig({pointsPerPeso:-1}),/Invalid loyalty config/);
 assert.throws(()=>normalizeLoyaltyConfig({pointValueCents:10001}),/Invalid loyalty config/);
});

// T005 kanban
test('T005: tablero, fases y tarjetas se validan; mover exige fase existente',()=>{
 assert.deepEqual(normalizeKanbanBoard({name:' Ventas ',sourceToolId:'C002'}),{name:'Ventas',sourceToolId:'C002'});
 assert.throws(()=>normalizeKanbanBoard({name:'x',sourceToolId:'T013'}),/Invalid kanban board/);
 assert.deepEqual(normalizeKanbanPhase({title:'Revisión'}),{title:'Revisión'});
 assert.throws(()=>normalizeKanbanPhase({title:'  '}),/Invalid kanban phase/);
 const card=normalizeKanbanCard({sourceToolId:'C003',sourceRecordId:uuid,phaseId:uuid,assignedUserId:null});
 assert.equal(card.sourceRecordId,uuid);
 assert.throws(()=>normalizeKanbanCard({sourceToolId:'C003',sourceRecordId:'no-uuid',phaseId:uuid}),/Invalid kanban card/);
 const phases=[{id:'a'},{id:'b'}];
 assert.deepEqual(kanbanMoveAllowed({phases,fromPhaseId:'a',toPhaseId:'a'}),{moved:false});
 assert.deepEqual(kanbanMoveAllowed({phases,fromPhaseId:'a',toPhaseId:'b'}),{moved:true});
 assert.throws(()=>kanbanMoveAllowed({phases,fromPhaseId:'a',toPhaseId:'z'}),/Invalid kanban move/);
});

// T006 firmas
test('T006: firma exige PNG real, consentimiento y firmante; disclaimer exacto',()=>{
 assert.match(SIGNATURE_DISCLAIMER,/no equivale a firma electrónica avanzada ni e\.firma/);
 assert.match(SIGNATURE_CONSENT_TEXT,/de forma voluntaria/);
 const data=png();
 const sig=normalizeSignature({signerName:'Ana Pérez',signerEmail:'ana@ejemplo.mx',targetType:'quote',targetId:uuid,consentAccepted:true,signatureData:data});
 assert.equal(sig.signatureHash,sha256Hex(data));
 assert.equal(sig.consentText,SIGNATURE_CONSENT_TEXT);
 assert.throws(()=>normalizeSignature({signerName:'Ana',targetType:'quote',targetId:uuid,consentAccepted:false,signatureData:data}),/Invalid signature/);
 assert.throws(()=>normalizeSignature({signerName:'Ana',targetType:'quote',targetId:uuid,consentAccepted:true,signatureData:'data:image/jpeg;base64,xxxx'}),/Invalid signature/);
 assert.throws(()=>normalizeSignature({signerName:'A',targetType:'quote',targetId:uuid,consentAccepted:true,signatureData:data}),/Invalid signature/);
 assert.ok(SIGNATURE_MAX_BYTES>=100000);
});

// T011 lotes
test('T011: lote y estado de caducidad (caducado, próximo, vigente, sin fecha)',()=>{
 const lot=normalizeLot({itemId:uuid,lotCode:'lote-7',quantity:50,expiresAt:'2026-12-01',receivedOn:'2026-11-01'});
 assert.equal(lot.lotCode,'LOTE-7');
 assert.throws(()=>normalizeLot({itemId:uuid,lotCode:'',quantity:1}),/Invalid lot/);
 assert.throws(()=>normalizeLot({itemId:uuid,lotCode:'L1',quantity:-1}),/Invalid lot/);
 const now=new Date('2026-11-13T12:00:00Z');
 assert.deepEqual(lotExpiryStatus('2026-11-01',{now}),{status:'expired',daysLeft:-12});
 assert.deepEqual(lotExpiryStatus('2026-12-01',{thresholdDays:30,now}),{status:'expiring_soon',daysLeft:18});
 assert.deepEqual(lotExpiryStatus('2027-06-01',{thresholdDays:30,now}),{status:'ok',daysLeft:200});
 assert.deepEqual(lotExpiryStatus(null,{now}),{status:'no_expiry',daysLeft:null});
 assert.deepEqual(normalizeLotAdjustment({delta:-10,note:'Venta'},{currentQuantity:50}),{delta:-10,note:'Venta',newQuantity:40});
 assert.throws(()=>normalizeLotAdjustment({delta:-60},{currentQuantity:50}),/Insufficient lot stock/);
 assert.throws(()=>normalizeLotAdjustment({delta:0},{currentQuantity:50}),/Invalid lot adjustment/);
});

// T012 escáner
test('T012: código normalizado, soporte por cámara y resolución a SKU',()=>{
 assert.equal(normalizeScanCode(' abc-123 '),'ABC-123');
 assert.throws(()=>normalizeScanCode(''),/Invalid scan code/);
 assert.deepEqual(scannerSupport({hasBarcodeDetector:true,hasGetUserMedia:true}),{mode:'camera',supported:true});
 assert.deepEqual(scannerSupport({hasBarcodeDetector:false,hasGetUserMedia:true}),{mode:'manual',supported:false,reason:'no_barcode_detector'});
 assert.deepEqual(scannerSupport({hasBarcodeDetector:false,hasGetUserMedia:false}),{mode:'manual',supported:false,reason:'no_camera'});
 const items=[{sku:'ZD421',name:'Impresora'},{sku:'ZT411',name:'Industrial',barcode:'7501234567890'}];
 assert.deepEqual(resolveScanCode('zd421',items),{found:true,item:items[0],matchedBy:'sku'});
 assert.deepEqual(resolveScanCode('7501234567890',items),{found:true,item:items[1],matchedBy:'barcode'});
 assert.deepEqual(resolveScanCode('NOEXISTE',items),{found:false,code:'NOEXISTE'});
});

// T019 comisiones
test('T019: reglas, resolución miembro-antes-que-general y cálculo por cobro',()=>{
 const member=normalizeCommissionRule({scope:'member',memberUserId:uuid,percentBp:1000});
 assert.equal(member.percentBp,1000);
 assert.throws(()=>normalizeCommissionRule({scope:'member',percentBp:1000}),/Invalid commission rule/);
 assert.throws(()=>normalizeCommissionRule({scope:'default',memberUserId:uuid,percentBp:1000}),/Invalid commission rule/);
 assert.throws(()=>normalizeCommissionRule({scope:'default',percentBp:10001}),/Invalid commission rule/);
 const rules=[{scope:'default',percentBp:500,active:true},{scope:'member',memberUserId:uuid,percentBp:1000,active:true}];
 assert.equal(resolveCommissionRule({rules,paymentCreatedBy:uuid}).percentBp,1000);
 assert.equal(resolveCommissionRule({rules,paymentCreatedBy:'otro'}).percentBp,500);
 assert.equal(resolveCommissionRule({rules:[],paymentCreatedBy:uuid}),null);
 assert.deepEqual(commissionForPayment(100000,{percentBp:1000}),{amountCents:10000,percentBp:1000});
 assert.deepEqual(commissionForPayment(999,{percentBp:1000}),{amountCents:99,percentBp:1000});
 assert.deepEqual(commissionForPayment(100000,null),{amountCents:0,percentBp:0});
 assert.throws(()=>commissionForPayment(0,{percentBp:1000}),/Invalid commission base/);
 const summary=summarizeCommissions([
  {amountCents:10000,memberUserId:uuid,period:'2026-11'},
  {amountCents:5000,memberUserId:uuid,period:'2026-11'},
  {amountCents:7000,memberUserId:'otro',period:'2026-10'}]);
 assert.equal(summary.totalCents,22000);
 assert.equal(summary.count,3);
 assert.equal(summary.byMember[uuid],15000);
 assert.equal(summary.byPeriod['2026-11'],15000);
 assert.equal(commissionPeriod('2026-11-13'),'2026-11');
 assert.throws(()=>commissionPeriod('13-11-2026'),/Invalid commission period/);
});
