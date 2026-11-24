// Regresión T016 (2026-11-24): `Node.append()` devuelve undefined, así que
// `form.append(container('toolbar')).lastChild.append(save)` lanzaba TypeError
// y el formulario no renderizaba. Afectaba a T010 (Transferir), T016 (Abrir
// caja, Registrar movimiento y Cierre), T017 y T018. El patrón correcto es
// append del toolbar y luego `form.lastChild.append(...)`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
const root = new URL('../', import.meta.url);
const assets = readdirSync(new URL('assets', root)).filter(f => f.endsWith('.js'));

test('ningún asset encadena .lastChild sobre el retorno de .append()', () => {
  const bad = /\.append\([^;]*\)\.lastChild/;
  for (const f of assets) {
    const src = readFileSync(new URL('assets/' + f, root), 'utf8');
    assert.doesNotMatch(src, bad, f + ' encadena .lastChild sobre append()');
  }
});

test('los 6 formularios de operational-p1b.js cuelgan su botón del toolbar ya anexado', () => {
  const src = readFileSync(new URL('assets/operational-p1b.js', root), 'utf8');
  const fixed = [...src.matchAll(/(\w+)\.append\(container\('toolbar'\)\); \1\.lastChild\.append\(/g)];
  assert.equal(fixed.length, 6, 'se esperaban 6 sitios corregidos, hay ' + fixed.length);
});
