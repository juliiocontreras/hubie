// Importación CSV + migración JSON (P0, E004) — lógica pura, sin dependencias
// de Node ni de base de datos: la reutilizan el servidor (platform/import-store.mjs)
// y los tests. La exportación CSV ya existe (T020, operations-reports.mjs);
// esto es el camino inverso: mismo vocabulario de columnas en español/inglés.
// Reglas: importación parcial (las filas válidas entran aunque otras fallen),
// reporte de errores por fila (fila, campo, motivo) y deduplicación por
// email (clientes) o SKU (catálogo) dentro del tenant.
import {normalizeClient} from './clients-domain.mjs';
import {normalizeCatalogItem,normalizeExpense,normalizeQuote} from './commerce-domain.mjs';

export const MAX_IMPORT_ROWS=500;
export const MAX_IMPORT_SECTIONS=4;

const stripAccents=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const normKey=s=>stripAccents(s).trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const emailOk=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const phoneOk=v=>/^[+0-9()\s.-]+$/.test(v)&&v.replace(/\D/g,'').length>=7&&v.replace(/\D/g,'').length<=16;

// Alias de encabezado (español/inglés) por campo canónico. La primera forma es
// la que usa la plantilla; las demás solo se reconocen al leer.
export const clientColumnAliases={
 name:['nombre','nombre o razon social','razon social','cliente','name','full name'],
 company:['empresa','company','negocio','compania'],
 email:['correo','correo electronico','e-mail','email','mail'],
 phone:['telefono','tel','phone','whatsapp','celular'],
 status:['estado','estatus','status'],
 notes:['notas','notes','observaciones','comentarios']
};
export const catalogColumnAliases={
 sku:['sku','codigo','code','clave'],
 name:['nombre','name','producto','articulo','item'],
 description:['descripcion','description','detalle'],
 price:['precio','precio mxn','price','price mxn','monto'],
 category:['categoria','category','grupo']
};
const clientFieldLabels={name:'Nombre',company:'Empresa',email:'Correo',phone:'Teléfono',status:'Estado',notes:'Notas'};
const catalogFieldLabels={sku:'SKU',name:'Nombre',description:'Descripción',price:'Precio',category:'Categoría'};

function aliasMap(aliases){
 const map=new Map();
 for(const [field,names] of Object.entries(aliases))for(const n of names)map.set(normKey(n),field);
 return map;
}
const clientAliases=aliasMap(clientColumnAliases);
const catalogAliases=aliasMap(catalogColumnAliases);

// Parser CSV RFC 4180 mínimo: comillas, comas y saltos de línea dentro de
// campo entrecomillado, CRLF/LF, BOM. Devuelve filas con su número de línea
// (la cabecera es la línea 1) para que el reporte de errores apunte al archivo.
export function parseCsv(text){
 if(typeof text!=='string')throw Error('Invalid import');
 const clean=text.replace(/^\uFEFF/,'');
 if(!clean.trim())throw Error('Invalid import');
 const rows=[];let field='',row=[],line=1,rowLine=1,inQuotes=false;
 const pushField=()=>{row.push(field);field='';};
 const pushRow=()=>{pushField();rows.push({values:row,line:rowLine});row=[];rowLine=line;};
 for(let i=0;i<clean.length;i++){
  const ch=clean[i];
  if(inQuotes){
   if(ch==='"'){if(clean[i+1]==='"'){field+='"';i++;}else inQuotes=false;}
   else{if(ch==='\n')line++;field+=ch;}
  }else if(ch==='"'&&field===''){inQuotes=true;}
  else if(ch===','){pushField();}
  else if(ch==='\r'){if(clean[i+1]==='\n')i++;line++;pushRow();}
  else if(ch==='\n'){line++;pushRow();}
  else field+=ch;
 }
 if(inQuotes)throw Error('Invalid import');
 if(field!==''||row.length)pushRow();
 const nonEmpty=rows.filter(r=>r.values.some(v=>String(v??'').trim()!==''));
 if(!nonEmpty.length)throw Error('Invalid import');
 return nonEmpty;
}

function detectColumns(headerValues,aliases){
 const columns=new Map();const unknown=[];
 headerValues.forEach((h,i)=>{
  const field=aliases.get(normKey(h));
  if(field&&!columns.has(field))columns.set(field,i);
  else if(!field)unknown.push(h);
 });
 return {columns,unknown};
}

// Precio en pesos (número o texto "$1,234.56" / "1234,56" / "1.234,56") a centavos.
// Devuelve null si no es un importe válido y no negativo.
export function parsePriceToCents(value){
 if(typeof value==='number'){
  if(!Number.isFinite(value)||value<0)return null;
  const cents=Math.round(value*100);
  return Number.isSafeInteger(cents)&&cents<=100_000_000_000?cents:null;
 }
 if(typeof value!=='string')return null;
 let s=value.trim().replace(/[$\s]|mxn/gi,'');
 if(!s||!/^[0-9.,]+$/.test(s))return null;
 const lastDot=s.lastIndexOf('.'),lastComma=s.lastIndexOf(',');
 if(lastDot!==-1&&lastComma!==-1){
  // El último separador es el decimal; el otro son miles.
  if(lastComma>lastDot)s=s.replace(/\./g,'').replace(',','.');
  else s=s.replace(/,/g,'');
 }else if(lastComma!==-1){
  const after=s.slice(lastComma+1);
  s=after.length===2?s.replace(',','.') : s.replace(/,/g,'');
 }
 if(!/^\d+(\.\d{1,2})?$/.test(s))return null;
 const cents=Math.round(Number(s)*100);
 return Number.isSafeInteger(cents)&&cents<=100_000_000_000?cents:null;
}

function canonicalFields(record,fields){
 const out={};
 for(const f of fields)if(record[f]!==undefined)out[f]=record[f];
 return out;
}
function translateKeys(record,aliases){
 if(!record||typeof record!=='object'||Array.isArray(record))return null;
 const out={};
 for(const [key,value] of Object.entries(record)){
  const field=aliases.get(normKey(key));
  if(field&&!(field in out))out[field]=value;
 }
 return out;
}

function clientErrors(record){
 const errors=[];
 const name=typeof record.name==='string'?record.name.trim():'';
 if(name.length<2)errors.push({field:'name',reason:'El nombre es obligatorio (mínimo 2 caracteres).'});
 if(typeof record.company==='string'&&record.company.trim().length>160)errors.push({field:'company',reason:'La empresa supera 160 caracteres.'});
 const email=typeof record.email==='string'?record.email.trim().toLowerCase():'';
 if(email&&!emailOk(email))errors.push({field:'email',reason:'El correo no tiene un formato válido.'});
 if(email.length>254)errors.push({field:'email',reason:'El correo supera 254 caracteres.'});
 const phone=typeof record.phone==='string'?record.phone.trim():'';
 if(phone&&!phoneOk(phone))errors.push({field:'phone',reason:'El teléfono no tiene un formato válido (7 a 16 dígitos).'});
 if(typeof record.status==='string'&&record.status.trim()&&!['prospect','active','inactive'].includes(record.status.trim().toLowerCase()))errors.push({field:'status',reason:'El estado debe ser prospect, active o inactive.'});
 if(typeof record.notes==='string'&&record.notes.trim().length>2000)errors.push({field:'notes',reason:'Las notas superan 2000 caracteres.'});
 return errors;
}

export function validateClientRecords(records,existingEmails=new Set()){
 const seen=new Set([...existingEmails].map(e=>String(e).toLowerCase()));
 const outRecords=[],errors=[];
 records.forEach((raw,i)=>{
  const row=raw._row??i+1;
  const record={...translateKeys(raw,clientAliases),...canonicalFields(raw,['name','company','email','phone','status','notes'])};
  const fieldErrors=clientErrors(record);
  const email=typeof record.email==='string'?record.email.trim().toLowerCase():'';
  if(email&&seen.has(email))fieldErrors.push({field:'email',reason:'Duplicado: ese correo ya existe en esta empresa.'});
  if(fieldErrors.length){for(const e of fieldErrors)errors.push({row,field:e.field,reason:e.reason});return;}
  try{
   const data=normalizeClient({name:record.name,company:record.company??'',email:record.email??'',phone:record.phone??'',status:(record.status||'prospect').toLowerCase(),notes:record.notes??''});
   if(email)seen.add(email);
   outRecords.push(data);
  }catch{errors.push({row,field:'name',reason:'La fila no pasa la validación de cliente.'});}
 });
 return {records:outRecords,errors,summary:summary(records.length,outRecords.length,errors)};
}

function catalogErrors(record){
 const errors=[];
 const name=typeof record.name==='string'?record.name.trim():'';
 if(name.length<2)errors.push({field:'name',reason:'El nombre es obligatorio (mínimo 2 caracteres).'});
 const sku=typeof record.sku==='string'?record.sku.trim().toUpperCase():'';
 if(sku&&!/^[A-Z0-9][A-Z0-9._-]{0,47}$/.test(sku))errors.push({field:'sku',reason:'El SKU solo admite letras, dígitos, punto, guion y guion bajo.'});
 if(parsePriceToCents(record.price)===null&&parsePriceToCents(record.priceCents)===null)errors.push({field:'price',reason:'El precio no es un importe válido (ejemplo: 129.50).'});
 if(typeof record.category==='string'&&record.category.trim().length>80)errors.push({field:'category',reason:'La categoría supera 80 caracteres.'});
 if(typeof record.description==='string'&&record.description.trim().length>2000)errors.push({field:'description',reason:'La descripción supera 2000 caracteres.'});
 return errors;
}

export function validateCatalogRecords(records,existingSkus=new Set()){
 const seen=new Set([...existingSkus].map(s=>String(s).toUpperCase()));
 const outRecords=[],errors=[];
 records.forEach((raw,i)=>{
  const row=raw._row??i+1;
  const record={...translateKeys(raw,catalogAliases),...canonicalFields(raw,['sku','name','description','price','priceCents','category','active'])};
  const fieldErrors=catalogErrors(record);
  const sku=typeof record.sku==='string'?record.sku.trim().toUpperCase():'';
  if(sku&&seen.has(sku))fieldErrors.push({field:'sku',reason:'Duplicado: ese SKU ya existe en este catálogo.'});
  if(fieldErrors.length){for(const e of fieldErrors)errors.push({row,field:e.field,reason:e.reason});return;}
  try{
   const priceCents=record.priceCents!==undefined&&record.priceCents!==''?Number(record.priceCents):parsePriceToCents(record.price);
   const data=normalizeCatalogItem({sku:record.sku??'',name:record.name,description:record.description??'',priceCents,category:record.category??'General',active:record.active??true});
   if(sku)seen.add(sku);
   outRecords.push(data);
  }catch{errors.push({row,field:'name',reason:'La fila no pasa la validación de catálogo.'});}
 });
 return {records:outRecords,errors,summary:summary(records.length,outRecords.length,errors)};
}

function summary(total,imported,errors){
 return {total,imported,skipped:total-imported,errors:errors.length,
  duplicates:errors.filter(e=>e.reason.startsWith('Duplicado')).length};
}

function csvToRecords(text,aliases,requiredField,requiredLabel){
 const parsed=parseCsv(text);
 const header=parsed[0];
 const {columns}=detectColumns(header.values,aliases);
 if(!columns.has(requiredField))throw Error('Invalid import');
 const dataRows=parsed.slice(1);
 if(dataRows.length>MAX_IMPORT_ROWS)throw Error('Invalid import');
 const fields=[...columns.keys()];
 const records=dataRows.map(r=>{
  const obj={_row:r.line};
  for(const field of fields)obj[field]=r.values[columns.get(field)]??'';
  return obj;
 });
 return {records,columns:[...columns.keys()],requiredLabel};
}

export function validateClientsCsv(text,existingEmails=new Set()){
 const {records}=csvToRecords(text,clientAliases,'name','Nombre');
 return validateClientRecords(records,existingEmails);
}
export function validateCatalogCsv(text,existingSkus=new Set()){
 const {records}=csvToRecords(text,catalogAliases,'name','Nombre');
 return validateCatalogRecords(records,existingSkus);
}

export const clientCsvTemplate='Nombre,Empresa,Correo,Teléfono,Estado,Notas\r\n'+
 'Ana López,Taller López,ana@ejemplo.mx,8112345678,active,Clienta desde 2024\r\n';
export const catalogCsvTemplate='SKU,Nombre,Descripción,Precio,Categoría\r\n'+
 'SKU-001,Impresora térmica,Impresora de etiquetas 203 dpi,6181.00,Impresoras\r\n';

// Migración JSON E004: {clients, catalogItems, quotes, expenses}. Cada sección
// es opcional; cada elemento se valida con el mismo dominio que la alta manual.
// Las cotizaciones aceptan líneas con unitPriceCents o unitPrice (pesos);
// los gastos aceptan amountCents o amount (pesos).
function mapQuote(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const lines=(raw.lines||[]).map(l=>({
  description:l?.description,
  quantity:l?.quantity,
  unitPriceCents:l?.unitPriceCents!==undefined?l.unitPriceCents:parsePriceToCents(l?.unitPrice??l?.price)
 }));
 return {title:raw.title,clientName:raw.clientName??raw.client??'',clientId:raw.clientId??null,
  notes:raw.notes??'',vatRate:raw.vatRate??16,validUntil:raw.validUntil??null,lines};
}
function mapExpense(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 return {description:raw.description,vendor:raw.vendor??'',
  amountCents:raw.amountCents!==undefined?raw.amountCents:parsePriceToCents(raw.amount??raw.price),
  occurredOn:raw.occurredOn??raw.date??raw.fecha,category:raw.category??'otros'};
}

export function validateMigrationPayload(input){
 let data=input;
 if(typeof input==='string'){
  try{data=JSON.parse(input);}catch{throw Error('Invalid import');}
 }
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid import');
 const sections=['clients','catalogItems','quotes','expenses'];
 if(!sections.some(k=>Array.isArray(data[k])))throw Error('Invalid import');
 for(const k of sections)if(data[k]!==undefined&&!Array.isArray(data[k]))throw Error('Invalid import');
 const clients=validateClientRecords((data.clients||[]).map((r,i)=>({...r,_row:i+1})));
 const catalogItems=validateCatalogRecords((data.catalogItems||[]).map((r,i)=>({...r,_row:i+1})));
 const quotes={records:[],errors:[]};
 (data.quotes||[]).forEach((raw,i)=>{
  try{quotes.records.push(normalizeQuote(mapQuote(raw)));}
  catch{quotes.errors.push({row:i+1,field:'title',reason:'La cotización no pasa la validación (título y al menos una partida válida).'});}
 });
 const expenses={records:[],errors:[]};
 (data.expenses||[]).forEach((raw,i)=>{
  try{expenses.records.push(normalizeExpense(mapExpense(raw)));}
  catch{expenses.errors.push({row:i+1,field:'description',reason:'El gasto no pasa la validación (concepto, monto y fecha válidos).'});}
 });
 const total=(data.clients?.length||0)+(data.catalogItems?.length||0)+(data.quotes?.length||0)+(data.expenses?.length||0);
 const imported=clients.records.length+catalogItems.records.length+quotes.records.length+expenses.records.length;
 const allErrors=[
  ...clients.errors.map(e=>({...e,section:'clients'})),
  ...catalogItems.errors.map(e=>({...e,section:'catalogItems'})),
  ...quotes.errors.map(e=>({...e,section:'quotes'})),
  ...expenses.errors.map(e=>({...e,section:'expenses'}))
 ];
 return {clients,catalogItems,quotes,expenses,
  errors:allErrors,
  summary:{total,imported,skipped:total-imported,errors:allErrors.length,
   duplicates:allErrors.filter(e=>e.reason.startsWith('Duplicado')).length,
   bySection:{clients:clients.summary,catalogItems:catalogItems.summary,
    quotes:{total:data.quotes?.length||0,imported:quotes.records.length,errors:quotes.errors.length},
    expenses:{total:data.expenses?.length||0,imported:expenses.records.length,errors:expenses.errors.length}}}};
}

export const migrationJsonTemplate=JSON.stringify({clients:[{name:'Ana López',company:'Taller López',email:'ana@ejemplo.mx',phone:'8112345678',status:'active',notes:''}],
 catalogItems:[{sku:'SKU-001',name:'Impresora térmica',description:'Impresora de etiquetas',price:6181.00,category:'Impresoras'}],
 quotes:[{title:'Cotización taller',clientName:'Ana López',vatRate:16,lines:[{description:'Instalación',quantity:1,unitPrice:1500.00}]}],
 expenses:[{description:'Renta local',category:'renta',amount:8500.00,occurredOn:'2026-11-01',vendor:'Inmobiliaria'}]},null,2);
export {clientFieldLabels,catalogFieldLabels};
