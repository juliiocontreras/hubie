import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCsv,parsePriceToCents,validateClientsCsv,validateCatalogCsv,
 validateClientRecords,validateCatalogRecords,validateMigrationPayload,
 clientCsvTemplate,catalogCsvTemplate,migrationJsonTemplate,MAX_IMPORT_ROWS} from '../platform/import.mjs';

const clientsValid='Nombre,Empresa,Correo,Teléfono,Estado,Notas\r\n'+
 'Ana López,Taller López,ana@ejemplo.mx,8112345678,active,Clienta desde 2024\r\n'+
 'Bruno Ruiz,,bruno@ejemplo.mx,8112345679,prospect,\r\n';
const clientsEnglish='Name,Company,Email,Phone,Status,Notes\nJohn Smith,Acme Inc,john@example.com,5551234567,active,VIP\n';
const clientsErrors='Nombre,Empresa,Correo,Teléfono,Estado,Notas\r\n'+
 ',Sin Nombre,sin@ejemplo.mx,8112345678,active,\r\n'+
 'Mala Correo,Empresa,mala-correo,8112345678,active,\r\n'+
 'Tel Malo,Empresa,tel@ejemplo.mx,abc,active,\r\n'+
 'Ana López,Taller López,ana@ejemplo.mx,8112345678,active,duplicado en archivo\r\n'+
 'Ana López,Taller López,ana@ejemplo.mx,8112345678,active,duplicado otra vez\r\n';
const catalogValid='SKU,Nombre,Descripción,Precio,Categoría\r\n'+
 'SKU-001,Impresora térmica,Impresora de etiquetas,"1,234.56",Impresoras\r\n'+
 ',Servicio de instalación,Instalación en sitio,850.00,Servicios\r\n'+
 'SKU-003,Curso,Curso en línea,"1234,56",Academia\r\n';
const catalogErrors='SKU,Nombre,Descripción,Precio,Categoría\r\n'+
 'SKU-001,Producto bueno,Primero válido,100.00,General\r\n'+
 'SKU-002,,Sin nombre,100.00,General\r\n'+
 'SKU-003,Producto,Precio malo,doce pesos,General\r\n'+
 'SKU-001,Duplicado,SKU repetido,50.00,General\r\n'+
 'SKU-004,Negativo,Precio negativo,-5.00,General\r\n';

test('parseCsv entiende comillas, CRLF y saltos dentro de campo',()=>{
 const rows=parseCsv('Nombre,Notas\r\n"Ana, López","línea 1\nlínea 2"\r\nBruno,simple\r\n');
 assert.equal(rows.length,3);
 assert.deepEqual(rows[1].values,['Ana, López','línea 1\nlínea 2']);
 assert.equal(rows[1].line,2);
 assert.equal(rows[2].line,4);
 assert.throws(()=>parseCsv('Nombre,Notas\n"Ana,sin cerrar\n'),/Invalid import/);
 assert.throws(()=>parseCsv('   \n'),/Invalid import/);
});

test('parsePriceToCents acepta pesos con miles, coma decimal y símbolo',()=>{
 assert.equal(parsePriceToCents('1,234.56'),123456);
 assert.equal(parsePriceToCents('1234,56'),123456);
 assert.equal(parsePriceToCents('1.234,56'),123456);
 assert.equal(parsePriceToCents('$ 850.00'),85000);
 assert.equal(parsePriceToCents('850'),85000);
 assert.equal(parsePriceToCents(129.5),12950);
 assert.equal(parsePriceToCents('doce'),null);
 assert.equal(parsePriceToCents('-5'),null);
 assert.equal(parsePriceToCents('12.345'),null);
 assert.equal(parsePriceToCents(''),null);
});

test('clientes CSV válido en español: importa 2 con resumen exacto',()=>{
 const r=validateClientsCsv(clientsValid);
 assert.deepEqual(r.summary,{total:2,imported:2,skipped:0,errors:0,duplicates:0});
 assert.equal(r.records[0].email,'ana@ejemplo.mx');
 assert.equal(r.records[1].status,'prospect');
 assert.deepEqual(r.errors,[]);
});

test('clientes CSV con encabezados en inglés: mismo mapeo',()=>{
 const r=validateClientsCsv(clientsEnglish);
 assert.equal(r.summary.imported,1);
 assert.equal(r.records[0].name,'John Smith');
 assert.equal(r.records[0].company,'Acme Inc');
});

test('clientes CSV con errores: importación parcial y reporte por fila',()=>{
 const r=validateClientsCsv(clientsErrors);
 assert.equal(r.summary.total,5);
 assert.equal(r.summary.imported,1);
 assert.equal(r.summary.errors,4);
 assert.equal(r.summary.duplicates,1);
 // Solo la fila 4 (primer Ana) entra; la 5 es duplicado en archivo.
 assert.equal(r.records[0].name,'Ana López');
 const byRow=new Map(r.errors.map(e=>[e.row,e]));
 assert.equal(byRow.get(2).field,'name');
 assert.equal(byRow.get(3).field,'email');
 assert.equal(byRow.get(4).field,'phone');
 assert.equal(byRow.get(6).field,'email');
 assert.match(byRow.get(6).reason,/Duplicado/);
});

test('clientes: deduplicación contra correos ya guardados en el tenant',()=>{
 const r=validateClientsCsv(clientsValid,new Set(['ana@ejemplo.mx']));
 assert.equal(r.summary.imported,1);
 assert.equal(r.records[0].email,'bruno@ejemplo.mx');
 assert.equal(r.errors[0].row,2);
});

test('clientes: sin columna Nombre el archivo se rechaza entero',()=>{
 assert.throws(()=>validateClientsCsv('Correo,Teléfono\nana@ejemplo.mx,8112345678\n'),/Invalid import/);
 const many='Nombre\n'+Array.from({length:MAX_IMPORT_ROWS+1},(_,i)=>'Cliente '+i).join('\n');
 assert.throws(()=>validateClientsCsv(many),/Invalid import/);
});

test('catálogo CSV válido: precios con miles y coma decimal',()=>{
 const r=validateCatalogCsv(catalogValid);
 assert.deepEqual(r.summary,{total:3,imported:3,skipped:0,errors:0,duplicates:0});
 assert.equal(r.records[0].priceCents,123456);
 assert.equal(r.records[0].sku,'SKU-001');
 assert.equal(r.records[1].sku,'');
 assert.equal(r.records[2].priceCents,123456);
});

test('catálogo CSV con encabezados en inglés y errores por fila',()=>{
 const r=validateCatalogCsv('SKU,Name,Description,Price,Category\nSKU-9,Widget,Bueno,10.00,General\n');
 assert.equal(r.summary.imported,1);
 const bad=validateCatalogCsv(catalogErrors);
 assert.equal(bad.summary.total,5);
 assert.equal(bad.summary.imported,1);
 assert.equal(bad.summary.errors,4);
 assert.equal(bad.summary.duplicates,1);
 const fields=bad.errors.map(e=>e.field);
 assert.ok(fields.includes('name')&&fields.includes('price')&&fields.includes('sku'));
});

test('catálogo: deduplicación por SKU sin importar mayúsculas y contra guardados',()=>{
 const r=validateCatalogRecords([{name:'Articulo A',sku:'sku-1',priceCents:100},{name:'Articulo B',sku:'SKU-1',priceCents:200}],new Set());
 assert.equal(r.records.length,1);
 const vsDb=validateCatalogCsv(catalogValid,new Set(['sku-001']));
 assert.equal(vsDb.summary.imported,2);
});

test('migración JSON E004: importa las 4 secciones y vincula la cotización al cliente',()=>{
 const payload=JSON.parse(migrationJsonTemplate);
 const r=validateMigrationPayload(payload);
 assert.equal(r.summary.total,4);
 assert.equal(r.summary.imported,4);
 assert.deepEqual(r.summary.bySection.clients,{total:1,imported:1,skipped:0,errors:0,duplicates:0});
 assert.equal(r.quotes.records[0].totalCents,174000);
 assert.equal(r.quotes.records[0].lines[0].unitPriceCents,150000);
 assert.equal(r.expenses.records[0].amountCents,850000);
 assert.deepEqual(r.errors,[]);
});

test('migración JSON: cotización sin partidas y gasto sin fecha se reportan sin cancelar el resto',()=>{
 const r=validateMigrationPayload({clients:[{name:'Ana López',email:'ana@ejemplo.mx'}],
  quotes:[{title:'Sin partidas',clientName:'Ana',lines:[]}],
  expenses:[{description:'Gasto',amount:100,occurredOn:'2026-13-01',category:'renta'}]});
 assert.equal(r.summary.total,3);
 assert.equal(r.summary.imported,1);
 assert.equal(r.summary.errors,2);
 assert.equal(r.errors[0].section,'quotes');
 assert.equal(r.errors[1].section,'expenses');
 assert.throws(()=>validateMigrationPayload({}),/Invalid import/);
 assert.throws(()=>validateMigrationPayload('no json'),/Invalid import/);
 assert.throws(()=>validateMigrationPayload([]),/Invalid import/);
 assert.throws(()=>validateMigrationPayload({clients:'no-array'}),/Invalid import/);
});

test('migración JSON acepta claves en español y montos en pesos',()=>{
 const r=validateMigrationPayload({clients:[{nombre:'Luis',correo:'luis@ejemplo.mx',telefono:'8112345678'}],
  catalogItems:[{nombre:'Tinta',precio:'250.50',categoria:'Insumos'}]});
 assert.equal(r.summary.imported,2);
 assert.equal(r.clients.records[0].name,'Luis');
 assert.equal(r.catalogItems.records[0].priceCents,25050);
});

test('plantillas: encabezados y ejemplo válidos',()=>{
 assert.match(clientCsvTemplate,/^Nombre,Empresa,Correo,Teléfono,Estado,Notas/);
 assert.match(catalogCsvTemplate,/^SKU,Nombre,Descripción,Precio,Categoría/);
 assert.equal(validateClientsCsv(clientCsvTemplate).summary.imported,1);
 assert.equal(validateCatalogCsv(catalogCsvTemplate).summary.imported,1);
 const sample=JSON.parse(migrationJsonTemplate);
 assert.ok(Array.isArray(sample.clients)&&Array.isArray(sample.quotes)&&Array.isArray(sample.expenses));
});
