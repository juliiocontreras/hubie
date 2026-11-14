import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const noEmoji=/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const noTextIcon=/content:\s*['"][⌄∨▾v><]['"]/;

test('P1-B UI renders the six tools with real lists, forms and actions',async()=>{
 const ui=await readFile('assets/operational-p1b.js','utf8');
 for(const fn of ['renderSuppliers','renderPurchases','renderWarehouses','renderCashbox','renderReceivables','renderPayables','renderExpenseBudgetsPanel']){
  assert.match(ui,new RegExp('export async function '+fn));
 }
 // Compras: partidas, envío, recepción y cancelación.
 assert.match(ui,/Agregar partida/);
 assert.match(ui,/Crear orden de compra/);
 assert.match(ui,/\/send/);
 assert.match(ui,/\/receive/);
 assert.match(ui,/Recepción registrada/);
 // Almacenes: transferencia con origen/destino.
 assert.match(ui,/Transferencia entre almacenes/);
 assert.match(ui,/\/transfer/);
 assert.match(ui,/Historial de transferencias/);
 // Caja: apertura, movimiento, arqueo y cierre.
 assert.match(ui,/Abrir caja/);
 assert.match(ui,/Registrar movimiento/);
 assert.match(ui,/Registrar arqueo/);
 assert.match(ui,/Cerrar caja/);
 assert.match(ui,/Diferencia/);
 // CxC: abonos contra saldo real; CxP: aprobar, abonar y pagar.
 assert.match(ui,/Registrar abono/);
 assert.match(ui,/\/installments/);
 assert.match(ui,/Aprobar/);
 assert.match(ui,/Marcar pagada/);
 // Presupuestos: mes, categoría, límite y descarga CSV del reporte.
 assert.match(ui,/Presupuestos por categoría y mes/);
 assert.match(ui,/Descargar reporte CSV del mes/);
 assert.match(ui,/SUPERADO/);
 assert.doesNotMatch(ui,noEmoji);
 assert.doesNotMatch(ui,noTextIcon);
 assert.match(ui,/Nunito/);
 assert.match(ui,/#16123a/);
 assert.match(ui,/#7c5cfc/);
 assert.match(ui,/#ec4899/);
});

test('app workflows dispatch the six P1-B tools to the real UI, not the generic form',async()=>{
 const workflows=await readFile('assets/app-workflows.js','utf8');
 for(const [id,fn] of [['T008','renderPurchases'],['T009','renderSuppliers'],['T010','renderWarehouses'],['T016','renderCashbox'],['T017','renderReceivables'],['T018','renderPayables']]){
  assert.match(workflows,new RegExp("key==='"+id+"'\\?"+fn));
 }
 assert.match(workflows,/from '\.\/operational-p1b\.js'/);
 const records=await readFile('assets/app-records.js','utf8');
 // La lista de exclusión creció con P2 (T001/T002/T005/T006/T011/T012/T019);
 // lo que importa es que las seis P1-B sigan yendo a la UI operativa.
 for(const id of ['T008','T009','T010','T016','T017','T018'])assert.match(records,new RegExp("'"+id+"'"));
 assert.match(records,/Aún no hay órdenes de compra/);
 assert.match(records,/Aún no hay proveedores/);
 assert.match(records,/Aún no hay almacenes/);
 assert.match(records,/Aún no hay cuentas por cobrar/);
 assert.match(records,/Aún no hay cuentas por pagar/);
 const forms=await readFile('assets/tool-forms.js','utf8');
 assert.match(forms,/Órdenes de compra por partidas con recepción ligada al inventario/);
 assert.match(forms,/Directorio maestro de proveedores/);
 assert.match(forms,/Stock por almacén y transferencias/);
 assert.match(forms,/Aperturas, movimientos, arqueos y cierres de caja/);
 assert.match(forms,/Saldos ligados a cotización aceptada/);
 assert.match(forms,/Cuentas por pagar a proveedor con vencimientos, abonos y aprobaciones/);
});

test('expenses UI mounts the budgets panel and links each expense to a real supplier',async()=>{
 const commerce=await readFile('assets/operational-commerce.js','utf8');
 assert.match(commerce,/renderExpenseBudgetsPanel/);
 assert.match(commerce,/from '\.\/operational-p1b\.js'/);
 assert.match(commerce,/expense-supplier/);
 assert.match(commerce,/Proveedor registrado/);
 assert.match(commerce,/supplierId:fields\.supplier\.input\.value/);
 assert.match(commerce,/supplierName/);
 const ui=await readFile('assets/operational-p1b.js','utf8');
 assert.match(ui,/budgetsPath\+'\?month='/);
 assert.match(ui,/reportPath\+'\?month='/);
});
