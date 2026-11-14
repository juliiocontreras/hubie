// Contrato UX de integración (2026-11-14): las listas commerce reales
// (T013/C006/C007/T014/T015) muestran "Sin resultados" + Limpiar búsqueda
// cuando la búsqueda no coincide, y la acción rápida "Nueva cotización"
// enfoca el formulario real en vez de pulsar el botón oculto #add-record.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read = p => readFile(new URL(p, import.meta.url), 'utf8');

test('commerce: las 5 listas usan emptyState con Sin resultados + Limpiar búsqueda', async () => {
 const src = await read('../assets/operational-commerce.js');
 assert.match(src, /function emptyState\(q,emptyText,clearSearch\)/);
 assert.match(src, /Sin resultados para tu búsqueda/);
 assert.match(src, /Limpiar búsqueda/);
 for (const msg of [
  'Sin cotizaciones; crea la primera',
  'Sin artículos en el catálogo',
  'Sin gastos en este rango',
  'Sin cobros registrados',
  'Sin facturas. Crea una',
 ]) assert.ok(src.includes(`emptyState(q,'${msg}`), msg);
 assert.equal((src.match(/emptyState\(q,'/g) || []).length, 5);
});

test('acción rápida Nueva cotización enfoca el formulario real de T013', async () => {
 const src = await read('../assets/app-console.js');
 assert.match(src, /#op-quote-title/);
 assert.match(src, /\.focus\(\)/);
});
