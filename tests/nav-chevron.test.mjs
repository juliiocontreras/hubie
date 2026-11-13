import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// Regresión 2026-11-13: el menú mostraba "Suitesv" / "Toolsv" porque el
// indicador era el carácter de texto ⌄ (U+2304) en summary::after.
// Los indicadores de desplegable son SVG de línea (chevron), nunca
// letras ni caracteres de texto (v, ⌄, ∨, ▾, ⌃). Si esto falla, volvió la v.
test('los desplegables del menú usan chevron SVG, no la v de texto',async()=>{
 const css=await readFile('assets/navigation.css','utf8');
 assert.doesNotMatch(css,/[\u2304\u2228\u25BE\u25B8\u2303]/,'navigation.css usa un carácter de texto como icono');
 assert.doesNotMatch(css,/\.hubie-navigation summary::after\s*\{\s*content:/,'el indicador del menú vuelve a ser ::after con texto');
 assert.match(css,/\.hubie-navigation details\[open\] summary \.hubie-chevron\{transform:rotate\(180deg\)\}/,'el chevron gira al abrir');
 const server=await readFile('server.mjs','utf8');
 for(const name of ['Suites','Tools','Soluciones']){
  assert.match(server,new RegExp(`<summary>${name}<svg[^>]*class=\\\\?"hubie-chevron`),`el menú ${name} lleva el chevron SVG`);
 }
 assert.doesNotMatch(server,/<summary>(Suites|Tools|Soluciones)<\/summary>/,'un summary del menú quedó sin chevron');
});
