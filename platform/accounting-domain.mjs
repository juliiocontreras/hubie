// T023 Contabilidad: validación/normalización pura, sin acceso a BD.
// Estilo de training-domain.mjs: funciones puras que lanzan 'Invalid ...'
// con claves estrictas (sin campos extra).
// SIN conexión al SAT ni timbrado: cálculo y reportes sobre los movimientos
// del tenant. Montos siempre en centavos enteros. Precios base SIN IVA.
export const ACCOUNT_TYPES=new Set(['activo','pasivo','capital','ingreso','gasto']);
export const ACCOUNT_TYPE_LABELS={activo:'Activo',pasivo:'Pasivo',capital:'Capital',ingreso:'Ingreso',gasto:'Gasto'};
export const ACCOUNT_NATURES=new Set(['deudora','acreedora']);
export const ACCOUNT_NATURE_BY_TYPE={activo:'deudora',gasto:'deudora',pasivo:'acreedora',capital:'acreedora',ingreso:'acreedora'};
export const ENTRY_STATUSES=new Set(['borrador','registrada','cancelada']);
export const ENTRY_STATUS_LABELS={borrador:'Borrador',registrada:'Registrada',cancelada:'Cancelada'};
export const ENTRY_SOURCES=new Set(['manual','sales_order','payment','invoice','expense']);
const ENTRY_TRANSITIONS={borrador:['registrada','cancelada'],registrada:['cancelada'],cancelada:[]};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dateOnly=/^\d{4}-\d{2}-\d{2}$/;
const moneyOk=x=>Number.isSafeInteger(x)&&x>=0&&x<=100_000_000_000;
function strictKeys(input,allowed,label){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!allowed.includes(k)))throw Error(label);
}
function str(v,max,def=''){
 if(v===undefined||v===null)return def;
 if(typeof v!=='string')throw Error('Invalid value');
 const t=v.trim();
 if(t.length>max)throw Error('Invalid value');
 return t;
}
function reqStr(v,min,max){
 const t=str(v,max);
 if(t.length<min)throw Error('Invalid value');
 return t;
}
function validDate(v){
 if(v===undefined||v===null)return null;
 if(typeof v!=='string'||!dateOnly.test(v)||Number.isNaN(Date.parse(v+'T00:00:00Z')))throw Error('Invalid value');
 return v;
}
// Catálogo base sugerido (códigos 1000–5999, naturaleza por tipo). El tenant
// puede editarlo: crear, renombrar o desactivar cuentas sin migrar nada.
export const DEFAULT_CHART=[
 {code:'1000',name:'Caja',type:'activo'},
 {code:'1010',name:'Bancos',type:'activo'},
 {code:'1100',name:'Clientes',type:'activo'},
 {code:'1200',name:'Inventario',type:'activo'},
 {code:'2000',name:'Proveedores',type:'pasivo'},
 {code:'2100',name:'IVA por pagar',type:'pasivo'},
 {code:'3000',name:'Capital social',type:'capital'},
 {code:'3200',name:'Resultados de ejercicios anteriores',type:'capital'},
 {code:'4000',name:'Ventas',type:'ingreso'},
 {code:'5000',name:'Costo de ventas',type:'gasto'},
 {code:'5100',name:'Gastos de operación',type:'gasto'}
];
export function normalizeAccount(input){
 strictKeys(input,['code','name','type','nature','parentId','active'],'Invalid account');
 const code=reqStr(input.code,1,20);
 const type=input.type===undefined?'activo':ACCOUNT_TYPES.has(input.type)?input.type:(()=>{throw Error('Invalid account');})();
 const nature=input.nature===undefined?ACCOUNT_NATURE_BY_TYPE[type]:ACCOUNT_NATURES.has(input.nature)?input.nature:(()=>{throw Error('Invalid account');})();
 if(nature!==ACCOUNT_NATURE_BY_TYPE[type])throw Error('Invalid account');
 if(input.parentId!==undefined&&input.parentId!==null&&(typeof input.parentId!=='string'||!uuid.test(input.parentId)))throw Error('Invalid account');
 if(input.active!==undefined&&typeof input.active!=='boolean')throw Error('Invalid account');
 return {code,name:reqStr(input.name,2,160),type,nature,parentId:input.parentId??null,active:input.active??true};
}
export function normalizeEntryLine(input,position=0){
 strictKeys(input,['accountId','debitCents','creditCents','memo'],'Invalid entry');
 if(typeof input.accountId!=='string'||!uuid.test(input.accountId))throw Error('Invalid entry');
 const debitCents=input.debitCents??0,creditCents=input.creditCents??0;
 if(!moneyOk(debitCents)||!moneyOk(creditCents))throw Error('Invalid entry');
 // Partida doble por línea: debe o haber, nunca ambos ni ninguno.
 if(!((debitCents>0&&creditCents===0)||(creditCents>0&&debitCents===0)))throw Error('Invalid entry');
 return {accountId:input.accountId,debitCents,creditCents,memo:str(input.memo,300),position};
}
export function normalizeEntry(input){
 strictKeys(input,['entryDate','concept','sourceType','sourceId','lines'],'Invalid entry');
 const lines=Array.isArray(input.lines)?input.lines.map((l,i)=>normalizeEntryLine(l,i)):[];
 if(lines.length<2||lines.length>100)throw Error('Invalid entry');
 const totalDebit=lines.reduce((a,l)=>a+l.debitCents,0);
 const totalCredit=lines.reduce((a,l)=>a+l.creditCents,0);
 // La póliza debe estar balanceada: debe == haber.
 if(totalDebit!==totalCredit||totalDebit<=0)throw Error('Invalid entry');
 const sourceType=input.sourceType??'manual';
 if(!ENTRY_SOURCES.has(sourceType))throw Error('Invalid entry');
 if(input.sourceId!==undefined&&input.sourceId!==null&&(typeof input.sourceId!=='string'||!uuid.test(input.sourceId)))throw Error('Invalid entry');
 return {entryDate:validDate(input.entryDate)??new Date().toISOString().slice(0,10),
  concept:reqStr(input.concept,2,300),sourceType,sourceId:input.sourceId??null,lines,totalDebitCents:totalDebit,totalCreditCents:totalCredit};
}
export function nextEntryStatus(current,next){
 if(!ENTRY_STATUSES.has(current)||!ENTRY_STATUSES.has(next))throw Error('Invalid entry status');
 if(!ENTRY_TRANSITIONS[current].includes(next))throw Error('Invalid entry status');
 return next;
}
// Saldo de una cuenta según su naturaleza: deudora = debe - haber,
// acreedora = haber - debe. En centavos.
export function accountBalance(account,movements){
 const debit=(movements?.debitCents||0),credit=(movements?.creditCents||0);
 return account.nature==='deudora'?debit-credit:credit-debit;
}
// Balanza de comprobación a partir de movimientos ya filtrados por periodo
// (solo pólizas registradas): {accountId: {debitCents, creditCents}}.
// Devuelve filas por cuenta (incluso con movimiento cero) y totales.
export function trialBalance(accounts,movementsByAccount){
 const rows=accounts.map(a=>{
  const m=movementsByAccount[a.id]||{debitCents:0,creditCents:0};
  return {accountId:a.id,code:a.code,name:a.name,type:a.type,nature:a.nature,
   debitCents:m.debitCents,creditCents:m.creditCents,balanceCents:accountBalance(a,m)};
 });
 const totalDebitCents=rows.reduce((a,r)=>a+r.debitCents,0);
 const totalCreditCents=rows.reduce((a,r)=>a+r.creditCents,0);
 return {rows,totalDebitCents,totalCreditCents,balanced:totalDebitCents===totalCreditCents};
}
// Estado de resultados del periodo: ingresos - gastos = utilidad.
export function incomeStatement(accounts,movementsByAccount){
 let incomeCents=0,expenseCents=0;
 for(const a of accounts){
  const m=movementsByAccount[a.id]||{debitCents:0,creditCents:0};
  if(a.type==='ingreso')incomeCents+=accountBalance(a,m);
  if(a.type==='gasto')expenseCents+=accountBalance(a,m);
 }
 return {incomeCents,expenseCents,profitCents:incomeCents-expenseCents};
}
// Balance general a una fecha: activo = pasivo + capital + utilidad.
// `movementsByAccount` son los movimientos acumulados hasta esa fecha.
export function balanceSheet(accounts,movementsByAccount){
 let assetsCents=0,liabilitiesCents=0,equityCents=0;
 for(const a of accounts){
  const m=movementsByAccount[a.id]||{debitCents:0,creditCents:0};
  const balance=accountBalance(a,m);
  if(a.type==='activo')assetsCents+=balance;
  else if(a.type==='pasivo')liabilitiesCents+=balance;
  else if(a.type==='capital')equityCents+=balance;
 }
 const {profitCents}=incomeStatement(accounts,movementsByAccount);
 return {assetsCents,liabilitiesCents,equityCents,profitCents,
  totalLiabilitiesEquityCents:liabilitiesCents+equityCents+profitCents,
  balanced:assetsCents===liabilitiesCents+equityCents+profitCents};
}
export function formatAccountFolio(folio){return 'P-'+String(folio).padStart(4,'0');}
