import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const operations={
 'platform/operations-portal.mjs':['createPortalAccess','listPortalAccess','revokePortalAccess','activatePortalAccess','loginPortal','verifyPortalSession','getPortalData','createPortalRequest','logoutPortal'],
 'platform/operations-loyalty.mjs':['getLoyalty','setLoyaltyConfig','awardLoyaltyForPayment','redeemLoyalty','adjustLoyalty'],
 'platform/operations-kanban.mjs':['listKanbanBoards','createKanbanBoard','getKanbanBoard','createKanbanPhase','deleteKanbanPhase','createKanbanCard','moveKanbanCard','archiveKanbanCard'],
 'platform/operations-signatures.mjs':['listSignatures','createSignature','getSignature'],
 'platform/operations-lots.mjs':['listLots','createLot','adjustLot','archiveLot','listExpiringLots'],
 'platform/operations-scanner.mjs':['resolveCode','scannerCapabilities'],
 'platform/operations-commissions.mjs':['listCommissions','createCommissionRule','archiveCommissionRule','calculateCommissions','recordProductCommission']
};
const assets={
 'assets/portal-p2.js':['renderPortal','renderPortalPage','Activa tu acceso'],
 'assets/loyalty-p2.js':['renderLoyalty','Otorgar puntos por cobro'],
 'assets/kanban-p2.js':['renderKanban','dragstart','drop'],
 'assets/signatures-p2.js':['renderSignatures','SIGNATURE_DISCLAIMER','no equivale a firma electrónica avanzada ni e.firma'],
 'assets/lots-p2.js':['renderLots','Próximos a caducar'],
 'assets/scanner-p2.js':['renderScanner','BarcodeDetector','getUserMedia','entrada manual'],
 'assets/commissions-p2.js':['renderCommissions','Calcular comisiones del periodo']
};
const emoji=/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

test('P2: cada módulo de operaciones exporta sus funciones y usa authorizeTool con scope por tenant',async()=>{
 for(const [file,functions] of Object.entries(operations)){
  const source=await readFile(file,'utf8');
  assert.match(source,/authorizeTool\(token,slug,'T0\d\d'/,file+' debe autorizar por tool');
  assert.match(source,/organization_id=\?/,file+' debe filtrar por organization_id');
  assert.match(source,/audit_events/,file+' debe auditar en audit_events');
  for(const fn of functions)assert.match(source,new RegExp('export (async )?function '+fn+'\\b'),file+' debe exportar '+fn);
 }
});
test('P2: los assets existen, exponen su render y no usan emojis como iconografía',async()=>{
 for(const [file,markers] of Object.entries(assets)){
  const source=await readFile(file,'utf8');
  for(const marker of markers)assert.ok(source.includes(marker),file+' debe contener: '+marker);
  assert.doesNotMatch(source,emoji,file+' no debe usar emojis como iconografía');
  assert.doesNotMatch(source,/#0000ff|#0000FF|blue/i,file+' no debe usar texto azul');
 }
});
test('P2: el portal público existe y no expone datos sin sesión',async()=>{
 const html=await readFile('portal.html','utf8');
 assert.match(html,/portal-p2\.js/);
 assert.match(html,/#16123a/,'portal con tinta Hubie');
 assert.match(html,/Nunito/);
 assert.doesNotMatch(html,emoji);
 const portal=await readFile('platform/operations-portal.mjs','utf8');
 assert.match(portal,/verifyPortalSession/);
 assert.match(portal,/throw Error\('Unauthorized'\)/);
});
test('P2: tool-forms.js ya no describe las tools P2 como genéricas',async()=>{
 const source=await readFile('assets/tool-forms.js','utf8');
 assert.match(source,/T001:'Portal de clientes con acceso seguro/);
 assert.match(source,/T002:'Programa de lealtad real/);
 assert.match(source,/T005:'Tablero Kanban real/);
 assert.match(source,/T006:'Firma simple con evidencia/);
 assert.match(source,/T011:'Lotes reales/);
 assert.match(source,/T012:'Escaneo real por cámara/);
 assert.match(source,/T019:'Comisiones reales/);
});
test('P2: los módulos de operaciones son importables sin base de datos',async()=>{
 for(const file of Object.keys(operations)){
  const module=await import('../'+file);
  assert.equal(typeof module,'object',file+' debe importar');
 }
 const domain=await import('../platform/tools-p2-domain.mjs');
 assert.equal(typeof domain.normalizeSignature,'function');
});
