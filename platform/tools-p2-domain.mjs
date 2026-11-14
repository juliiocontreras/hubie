// Tools P2 domain: portal (T001), lealtad (T002), kanban (T005), firmas (T006),
// lotes (T011), escáner (T012) y comisiones (T019).
// Validación y cálculo puros, sin dependencias de Node salvo crypto para el
// hash de evidencia. Reutilizable en servidor y tests. Moneda en centavos.
// Nada aquí finge integraciones externas: lo que no existe se etiqueta como
// pendiente en la UI, nunca se simula.
import {createHash} from 'node:crypto';

const clean=(value,max)=>typeof value==='string'&&value.trim().length<=max?value.trim():null;
const entityId=value=>value===undefined||value===null||value==='' ? null :
 typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)?value:undefined;
const dateOk=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const moneyOk=x=>Number.isSafeInteger(x)&&x>=0&&x<=100_000_000_000;
const moneyPositive=x=>Number.isSafeInteger(x)&&x>0&&x<=100_000_000_000;

export function sha256Hex(value){
 if(typeof value!=='string'||!value)throw Error('Invalid hash input');
 return createHash('sha256').update(value,'utf8').digest('hex');
}

// ---------------------------------------------------------------- T001 portal
export const PORTAL_TOKEN_TTL_HOURS=24;
export const PORTAL_SESSION_TTL_HOURS=12;
export const PORTAL_PASSWORD_MIN_LENGTH=10;

export function normalizePortalPassword(password){
 if(typeof password!=='string'||password.length<PORTAL_PASSWORD_MIN_LENGTH||password.length>128)throw Error('Invalid portal password');
 if(!/[a-zA-Z]/.test(password)||!/[0-9]/.test(password))throw Error('Invalid portal password');
 return password;
}
export function normalizePortalEmail(email){
 const value=clean(email,160)?.toLowerCase();
 if(!value||!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value))throw Error('Invalid portal email');
 return value;
}
// El token de activación es de un solo uso y caduca a las 24 h. Solo se guarda
// su hash SHA-256 (mismo patrón que organization_invitations.token_hash).
export function portalTokenState({tokenHash,expiresAt,consumedAt,now=new Date()}){
 if(!tokenHash||typeof tokenHash!=='string')return {valid:false,reason:'not_found'};
 if(consumedAt)return {valid:false,reason:'consumed'};
 if(!expiresAt||Date.parse(expiresAt)<=now.getTime())return {valid:false,reason:'expired'};
 return {valid:true};
}
export function portalTokenExpiredAt(now=new Date()){
 return new Date(now.getTime()+PORTAL_TOKEN_TTL_HOURS*3600000).toISOString();
}
export function normalizePortalRequest(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid portal request');
 const subject=clean(input.subject,180);
 const message=clean(input.message,4000);
 if(!subject||subject.length<2||!message||message.length<2)throw Error('Invalid portal request');
 return {subject,message};
}
export const portalRequestStatuses=Object.freeze(['open','in_progress','closed']);
export function nextPortalRequestStatus(current,next){
 if(!portalRequestStatuses.includes(current)||!portalRequestStatuses.includes(next))throw Error('Invalid portal request status');
 if(current==='closed'&&next!=='open')throw Error('Invalid portal request status');
 return next;
}

// ---------------------------------------------------------------- T002 lealtad
export function normalizeLoyaltyConfig(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid loyalty config');
 const pointsPerPeso=input.pointsPerPeso??1;
 const pointValueCents=input.pointValueCents??10;
 const minRedeemPoints=input.minRedeemPoints??100;
 const active=input.active??true;
 if(!Number.isSafeInteger(pointsPerPeso)||pointsPerPeso<0||pointsPerPeso>1000||
   !Number.isSafeInteger(pointValueCents)||pointValueCents<0||pointValueCents>10000||
   !Number.isSafeInteger(minRedeemPoints)||minRedeemPoints<1||minRedeemPoints>100000||
   typeof active!=='boolean')throw Error('Invalid loyalty config');
 return {pointsPerPeso,pointValueCents,minRedeemPoints,active};
}
export const defaultLoyaltyConfig=Object.freeze({pointsPerPeso:1,pointValueCents:10,minRedeemPoints:100,active:true});
// Ganas al pagar: 1 punto por cada peso cobrado (configurable). Solo cobros
// confirmados (tenant_collections no archivados) generan puntos.
export function earnPointsForPayment(amountCents,config){
 const cfg=normalizeLoyaltyConfig(config||{});
 if(!moneyPositive(amountCents))throw Error('Invalid loyalty earn');
 if(!cfg.active)return 0;
 return Math.floor(amountCents/100)*cfg.pointsPerPeso;
}
export function redeemValueCents(points,config){
 const cfg=normalizeLoyaltyConfig(config||{});
 if(!Number.isSafeInteger(points)||points<=0)throw Error('Invalid loyalty redeem');
 return points*cfg.pointValueCents;
}
export function normalizeLoyaltyRedeem(input,{balancePoints,config}={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid loyalty redeem');
 const cfg=normalizeLoyaltyConfig(config||{});
 const clientId=entityId(input.clientId);
 const points=input.points;
 const note=clean(input.note??'',300);
 if(clientId===undefined||!clientId||!Number.isSafeInteger(points)||points<=0||note===null)throw Error('Invalid loyalty redeem');
 if(points<cfg.minRedeemPoints)throw Error('Invalid loyalty redeem');
 if(!Number.isSafeInteger(balancePoints)||points>balancePoints)throw Error('Insufficient loyalty points');
 return {clientId,points,note,valueCents:points*cfg.pointValueCents};
}
export function loyaltyBalance(movements){
 let balance=0;
 for(const m of movements||[]){
  if(!Number.isSafeInteger(m?.deltaPoints))throw Error('Invalid loyalty ledger');
  balance+=m.deltaPoints;
 }
 return balance;
}

// ---------------------------------------------------------------- T005 kanban
export const kanbanCardSources=Object.freeze(['C002','C003','generic']);
export const defaultKanbanPhases=Object.freeze(['Por hacer','En curso','Hecho']);
export function normalizeKanbanBoard(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid kanban board');
 const name=clean(input.name,120);
 const sourceToolId=input.sourceToolId??'C002';
 if(!name||name.length<2||!kanbanCardSources.includes(sourceToolId))throw Error('Invalid kanban board');
 return {name,sourceToolId};
}
export function normalizeKanbanPhase(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid kanban phase');
 const title=clean(input.title,80);
 if(!title||title.length<1)throw Error('Invalid kanban phase');
 return {title};
}
export function normalizeKanbanCard(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid kanban card');
 const sourceToolId=input.sourceToolId;
 const sourceRecordId=entityId(input.sourceRecordId);
 const phaseId=entityId(input.phaseId);
 const assignedUserId=entityId(input.assignedUserId);
 if(!kanbanCardSources.includes(sourceToolId)||sourceRecordId===undefined||!sourceRecordId||
   phaseId===undefined||!phaseId||assignedUserId===undefined)throw Error('Invalid kanban card');
 return {sourceToolId,sourceRecordId,phaseId,assignedUserId};
}
export function kanbanMoveAllowed({phases,fromPhaseId,toPhaseId}){
 if(!Array.isArray(phases)||!phases.some(p=>p.id===toPhaseId))throw Error('Invalid kanban move');
 if(fromPhaseId===toPhaseId)return {moved:false};
 return {moved:true};
}

// ---------------------------------------------------------------- T006 firmas
export const SIGNATURE_DISCLAIMER='Firma simple con evidencia, no equivale a firma electrónica avanzada ni e.firma.';
export const SIGNATURE_CONSENT_TEXT='Firmo este documento de forma voluntaria y acepto que mi firma dibujada, junto con la fecha, mi nombre y el hash de evidencia, quede registrada como constancia de aceptación.';
export const SIGNATURE_MAX_BYTES=200_000;
export function normalizeSignature(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid signature');
 const signerName=clean(input.signerName,160);
 const signerEmail=input.signerEmail?normalizePortalEmail(input.signerEmail):null;
 const targetType=input.targetType;
 const targetId=entityId(input.targetId);
 const consentAccepted=input.consentAccepted===true;
 const signatureData=input.signatureData;
 if(!signerName||signerName.length<2||!['case','quote','generic'].includes(targetType)||
   targetId===undefined||!targetId||!consentAccepted||
   typeof signatureData!=='string'||!signatureData.startsWith('data:image/png;base64,'))throw Error('Invalid signature');
 const base64=signatureData.slice('data:image/png;base64,'.length);
 if(!/^[A-Za-z0-9+/=]+$/.test(base64)||base64.length<100)throw Error('Invalid signature');
 const bytes=Buffer.from(base64,'base64');
 if(bytes.length>SIGNATURE_MAX_BYTES||bytes.length<100)throw Error('Invalid signature');
 if(!bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))throw Error('Invalid signature');
 return {signerName,signerEmail,targetType,targetId,consentAccepted,signatureData,
  signatureHash:sha256Hex(signatureData),consentText:SIGNATURE_CONSENT_TEXT};
}

// ---------------------------------------------------------------- T011 lotes
export function normalizeLot(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid lot');
 const itemId=entityId(input.itemId);
 const lotCode=clean(input.lotCode,48)?.toUpperCase();
 const quantity=input.quantity;
 const expiresAt=input.expiresAt??null;
 const receivedOn=input.receivedOn??null;
 if(itemId===undefined||!itemId||!lotCode||!/^[A-Z0-9][A-Z0-9._-]{0,47}$/.test(lotCode)||
   !Number.isSafeInteger(quantity)||quantity<0||quantity>1_000_000_000||
   (expiresAt!==null&&!dateOk(expiresAt))||(receivedOn!==null&&!dateOk(receivedOn)))throw Error('Invalid lot');
 return {itemId,lotCode,quantity,expiresAt,receivedOn};
}
export function lotExpiryStatus(expiresAt,{thresholdDays=30,now=new Date()}={}){
 if(!expiresAt)return {status:'no_expiry',daysLeft:null};
 if(!dateOk(expiresAt))throw Error('Invalid lot expiry');
 const daysLeft=Math.floor((Date.parse(expiresAt+'T00:00:00Z')-Date.parse(now.toISOString().slice(0,10)+'T00:00:00Z'))/86400000);
 if(daysLeft<0)return {status:'expired',daysLeft};
 if(daysLeft<=thresholdDays)return {status:'expiring_soon',daysLeft};
 return {status:'ok',daysLeft};
}
export function normalizeLotAdjustment(input,{currentQuantity}={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid lot adjustment');
 const delta=input.delta;
 const note=clean(input.note??'',300);
 if(!Number.isSafeInteger(delta)||delta===0||Math.abs(delta)>1_000_000_000||note===null)throw Error('Invalid lot adjustment');
 if(!Number.isSafeInteger(currentQuantity)||currentQuantity+delta<0)throw Error('Insufficient lot stock');
 return {delta,note,newQuantity:currentQuantity+delta};
}

// ---------------------------------------------------------------- T012 escáner
export function normalizeScanCode(raw){
 if(typeof raw!=='string')throw Error('Invalid scan code');
 const code=raw.trim().toUpperCase();
 if(!code||code.length>128||!/^[A-Z0-9][A-Z0-9._\-/: ]{0,127}$/.test(code))throw Error('Invalid scan code');
 return code.replace(/\s+/g,'');
}
// Detección de soporte: el escaneo por cámara exige BarcodeDetector y cámara.
// Sin eso la UI ofrece entrada manual; nunca se finge un escaneo.
export function scannerSupport({hasBarcodeDetector=false,hasGetUserMedia=false}={}){
 if(hasBarcodeDetector&&hasGetUserMedia)return {mode:'camera',supported:true};
 if(hasGetUserMedia)return {mode:'manual',supported:false,reason:'no_barcode_detector'};
 return {mode:'manual',supported:false,reason:'no_camera'};
}
export function resolveScanCode(code,items){
 const normalized=normalizeScanCode(code);
 const list=Array.isArray(items)?items:[];
 const bySku=list.find(i=>typeof i?.sku==='string'&&i.sku.toUpperCase()===normalized);
 if(bySku)return {found:true,item:bySku,matchedBy:'sku'};
 const byBarcode=list.find(i=>typeof i?.barcode==='string'&&i.barcode.toUpperCase()===normalized);
 if(byBarcode)return {found:true,item:byBarcode,matchedBy:'barcode'};
 return {found:false,code:normalized};
}

// ---------------------------------------------------------------- T019 comisiones
export const commissionRuleScopes=Object.freeze(['member','product','default']);
export function normalizeCommissionRule(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid commission rule');
 const scope=input.scope??'default';
 const percentBp=input.percentBp;
 const memberUserId=entityId(input.memberUserId);
 const catalogItemId=entityId(input.catalogItemId);
 const active=input.active??true;
 if(!commissionRuleScopes.includes(scope)||!Number.isSafeInteger(percentBp)||percentBp<0||percentBp>10000||
   memberUserId===undefined||catalogItemId===undefined||typeof active!=='boolean')throw Error('Invalid commission rule');
 if(scope==='member'&&!memberUserId)throw Error('Invalid commission rule');
 if(scope==='product'&&!catalogItemId)throw Error('Invalid commission rule');
 if(scope==='default'&&(memberUserId||catalogItemId))throw Error('Invalid commission rule');
 return {scope,percentBp,memberUserId,catalogItemId,active};
}
// Resolución de regla: regla del miembro que registró el cobro, si no la
// general del tenant. Las reglas por producto se aplican al registrar la
// comisión de un cobro concreto con su producto (ver operations-commissions).
export function resolveCommissionRule({rules,paymentCreatedBy}){
 const list=(rules||[]).filter(r=>r?.active!==false);
 const member=list.find(r=>r.scope==='member'&&r.memberUserId===paymentCreatedBy);
 if(member)return member;
 return list.find(r=>r.scope==='default')||null;
}
// Sin cobro confirmado no hay comisión: solo tenant_collections no archivados.
export function commissionForPayment(amountCents,rule){
 if(!moneyPositive(amountCents))throw Error('Invalid commission base');
 if(!rule)return {amountCents:0,percentBp:0};
 if(!Number.isSafeInteger(rule.percentBp)||rule.percentBp<0||rule.percentBp>10000)throw Error('Invalid commission rule');
 return {amountCents:Math.floor(amountCents*rule.percentBp/10000),percentBp:rule.percentBp};
}
export function summarizeCommissions(entries){
 const byMember={},byPeriod={};
 let totalCents=0,count=0;
 for(const e of entries||[]){
  if(!moneyOk(e?.amountCents))throw Error('Invalid commission entry');
  totalCents+=e.amountCents;count+=1;
  const member=e.memberUserId||'unassigned';
  byMember[member]=(byMember[member]||0)+e.amountCents;
  const period=typeof e?.period==='string'?e.period:'';
  if(period)byPeriod[period]=(byPeriod[period]||0)+e.amountCents;
 }
 return {totalCents,count,byMember,byPeriod};
}
export function commissionPeriod(dateStr){
 if(!dateOk(dateStr))throw Error('Invalid commission period');
 return dateStr.slice(0,7);
}
