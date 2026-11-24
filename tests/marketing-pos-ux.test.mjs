import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const noEmoji=/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const noTextIcon=/content:\s*['"][⌄∨▾v><]['"]/;

test('T029 UI: panel con pestañas Tablero, Campañas, Segmentos y Envíos',async()=>{
 const ui=await readFile('assets/operational-marketing.js','utf8');
 assert.match(ui,/export async function renderMarketing/);
 for(const tab of ['Tablero','Campañas','Segmentos','Envíos']){
  assert.ok(ui.includes("'"+tab+"'")||ui.includes('"'+tab+'"'),'falta pestaña '+tab);
 }
 assert.match(ui,/Crear campaña/);
 assert.match(ui,/Crear segmento/);
 assert.match(ui,/Enviar campaña/);
 assert.match(ui,/Sin envío real \(falta clave Resend\)/);
 // El panel consume los endpoints reales del store, no datos inventados.
 for(const path of ["base+'/dashboard'","base+'/campaigns'","base+'/segments'","/preview","/send","/sends"]){
  assert.ok(ui.includes(path),'falta endpoint '+path);
 }
 assert.doesNotMatch(ui,noEmoji);
 assert.doesNotMatch(ui,noTextIcon);
 assert.match(ui,/Nunito/);
 assert.match(ui,/#16123a/);
 assert.doesNotMatch(ui,/#0000ff|#0000FF|blue/i);
});

test('T029 cableado: app-workflows, app-records, icono mail y rutas del servidor',async()=>{
 const workflows=await readFile('assets/app-workflows.js','utf8');
 assert.match(workflows,/key==='T029'\?renderMarketing/);
 assert.match(workflows,/from '\.\/operational-marketing\.js'/);
 const records=await readFile('assets/app-records.js','utf8');
 assert.match(records,/'T029'/);
 const icons=await readFile('assets/ui-icons.js','utf8');
 assert.match(icons,/mail/);
 assert.match(icons,/T029:'mail'/);
 assert.doesNotMatch(icons,noEmoji);
 const server=await readFile('server.mjs','utf8');
 assert.ok(server.includes("/marketing(?:\\/(.*))?"),'ruta base /marketing/...');
 for(const segment of ["'dashboard'","'segments'","'campaigns'","'preview'","'sends'","'send'"]){
  assert.ok(server.includes(segment),'falta ruta marketing '+segment);
 }
 assert.ok(server.includes('034_marketing.sql'),'migración 034 en applyCoreSchema');
 const catalog=JSON.parse(await readFile('assets/catalog.json','utf8'));
 const tool=catalog.tools.find(t=>t.id==='T029');
 assert.equal(tool.name,'Marketing');
 assert.equal(tool.group,'Marketing');
 assert.equal(tool.price,null);
 assert.equal(tool.pricing,'quote');
});

test('T029 demo: el espejo en demo-backend cubre los endpoints y se habilita en comercio-demo',async()=>{
 const demo=await readFile('assets/demo-backend.js','utf8');
 assert.match(demo,/marketing:\{segments:\[\],campaigns:\[\],sends:\[\]\}/);
 assert.match(demo,/mkRoute=p\.match\(\/\^\\\/api\\\/app\\\/\(\[a-z0-9-\]\+\)\\\/marketing/);
 for(const segment of ['dashboard','segments','campaigns','preview','sends','send']){
  assert.match(demo,new RegExp("seg\\[\\d\\]==='"+segment+"'"),'falta espejo demo de '+segment);
 }
 // Sin clave Resend en la demo el envío degrada con gracia, como el servidor.
 assert.match(demo,/status:'sin_envio'/);
 assert.match(demo,/Sin envío real \(falta clave Resend\)/);
 assert.doesNotMatch(demo,noEmoji);
});

test('T030 UI: venta con chips de categoría, tarjetas con foto, variantes, stepper y resumen del carrito',async()=>{
 const ui=await readFile('assets/operational-pos.js','utf8');
 assert.match(ui,/export async function renderPos/);
 for(const tab of ['Venta','Ventas','Tablero']){
  assert.ok(ui.includes("'"+tab+"'")||ui.includes('"'+tab+'"'),'falta pestaña '+tab);
 }
 assert.match(ui,/Resumen del carrito/);
 assert.match(ui,/Para llevar/);
 assert.match(ui,/En local/);
 assert.match(ui,/A domicilio/);
 assert.match(ui,/Cobrar/);
 assert.match(ui,/Ticket/);
 assert.match(ui,/IVA \(16%\)/);
 assert.match(ui,/pos-bottombar/,'a 390 px el carrito va como barra inferior fija con el total');
 // El panel consume los endpoints reales del store, no datos inventados.
 for(const path of ["base+'/dashboard'","base+'/catalog'","base+'/sales'"]){
  assert.ok(ui.includes(path),'falta endpoint '+path);
 }
 assert.doesNotMatch(ui,noEmoji);
 assert.doesNotMatch(ui,noTextIcon);
 assert.match(ui,/Nunito/);
 assert.match(ui,/#16123a/);
 assert.doesNotMatch(ui,/#0000ff|#0000FF|blue/i);
});

test('T030 cableado: app-workflows, app-records, icono de carrito y rutas del servidor',async()=>{
 const workflows=await readFile('assets/app-workflows.js','utf8');
 assert.match(workflows,/key==='T030'\?renderPos/);
 assert.match(workflows,/from '\.\/operational-pos\.js'/);
 const records=await readFile('assets/app-records.js','utf8');
 assert.match(records,/'T030'/);
 const icons=await readFile('assets/ui-icons.js','utf8');
 assert.match(icons,/shoppingCart/);
 assert.match(icons,/T030:'shoppingCart'/);
 assert.doesNotMatch(icons,noEmoji);
 const server=await readFile('server.mjs','utf8');
 assert.ok(server.includes("/pos(?:\\/(.*))?"),'ruta base /pos/...');
 for(const segment of ["'dashboard'","'catalog'","'sales'"]){
  assert.ok(server.includes(segment),'falta ruta pos '+segment);
 }
 assert.ok(server.includes('035_pos.sql'),'migración 035 en applyCoreSchema');
 assert.ok(server.includes('/assets/operational-marketing.js'),'asset de marketing permitido en la PWA');
 assert.ok(server.includes('/assets/operational-pos.js'),'asset de POS permitido en la PWA');
 const catalog=JSON.parse(await readFile('assets/catalog.json','utf8'));
 const tool=catalog.tools.find(t=>t.id==='T030');
 assert.equal(tool.name,'Punto de venta');
 assert.equal(tool.group,'Finanzas');
 assert.equal(tool.price,null);
 assert.equal(tool.pricing,'quote');
});

test('T030 demo: el espejo en demo-backend cubre los endpoints y se habilita en comercio-demo',async()=>{
 const demo=await readFile('assets/demo-backend.js','utf8');
 assert.match(demo,/pos:\{sales:\[\],saleLines:\[\]\}/);
 assert.match(demo,/posRoute=p\.match\(\/\^\\\/api\\\/app\\\/\(\[a-z0-9-\]\+\)\\\/pos/);
 for(const segment of ['dashboard','catalog','sales']){
  assert.match(demo,new RegExp("seg\\[\\d\\]==='"+segment+"'"),'falta espejo demo de '+segment);
 }
 // El espejo calcula el IVA en el demo igual que el servidor y genera el folio.
 assert.match(demo,/folioText:'POS-'/);
 assert.match(demo,/Math\.round\(subtotal\*16\/100\)/);
 assert.doesNotMatch(demo,noEmoji);
});
