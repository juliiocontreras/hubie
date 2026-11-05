import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url);
const pages = ['index.html', 'suite.html', 'tools.html', 'servicios.html'];
test('supporting illustrations referenced by pages exist and are valid SVG roots', () => {
  for (const page of pages) {
    const html = readFileSync(new URL(page, root), 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="\\?\/?assets\/(scene-[^"]+\.svg)"/g)];
    assert.ok(refs.length > 0, page + ' should contain supporting artwork');
    for (const [, filename] of refs) {
      const path = new URL('assets/' + filename, root);
      assert.ok(existsSync(path), page + ': missing ' + filename);
      const svg = readFileSync(path, 'utf8');
      assert.match(svg, /^<svg\s/);
      assert.match(svg, /<\/svg>\s*$/);
    }
  }
});
test('Suite gallery has ten distinct sector illustrations', () => {
  const html = readFileSync(new URL('suite.html', root), 'utf8');
  const refs = [...html.matchAll(/src="\/assets\/(scene-[^"]+\.svg)"/g)].map(m => m[1]);
  assert.equal(new Set(refs).size, 10);
});
