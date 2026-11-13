import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Modern design upgrade (2026-11-12): glass + gradient mesh, one pastel
// tinted tile per tool, brand tokens, no visible scrollbars. Visual-only
// contracts asserted on file contents (see tests/mobile-nav-stacking.test.mjs
// for the mobile-nav fix, which must stay intact alongside these).
const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');

test('PWA keeps the brand gradient mesh, glass cards and hidden scrollbars', async () => {
  const css = await read('../assets/pwa-refined.css');
  assert.match(css, /--grad-brand:\s*linear-gradient\(135deg,#7c5cfc 0%,#a855f7 45%,#ec4899 100%\)/);
  assert.match(css, /--bg-card:\s*rgba\(255,255,255,\s*\.78\)/);
  assert.match(css, /backdrop-filter:\s*blur\(18px\)/);
  assert.match(css, /\*\{scrollbar-width:\s*none/);
  assert.match(css, /\*::-webkit-scrollbar\{display:\s*none\}/);
  assert.match(css, /\.btn\{[^}]*border-radius:\s*999px/);
  assert.match(css, /\.page-head h1[^{]*\{[^}]*font-weight:\s*900/);
  // Mobile-nav fix must survive the upgrade: .shell keeps isolation:isolate
  // when closed (pwa-navigation.css lifts it only while the menu is open).
  assert.match(css, /\.shell\{[^}]*isolation:\s*isolate/);
});

test('PWA tool tiles carry one pastel tint per tool family', async () => {
  const css = await read('../assets/pwa-refined.css');
  for (const [tint, bg] of [
    ['crm', '#efeafe'], ['agenda', '#e9f0ff'], ['inventario', '#e6fbf0'],
    ['cobros', '#fdeaf4'], ['vendedores', '#fff0e6'], ['bots', '#f1eafe'],
    ['catalogos', '#e2f8fc'], ['expedientes', '#e0f7f5'], ['gastos', '#fef3c7'],
    ['reportes', '#f3e8ff'],
  ]) {
    assert.match(css, new RegExp(`\\.company-icon\\[data-tint="${tint}"\\]\\{background:${bg}`),
      `missing tint tile for ${tint}`);
  }
  const icons = await read('../assets/ui-icons.js');
  assert.match(icons, /export const toolTint/);
  assert.match(icons, /C002:\s*'crm'/);
  assert.match(icons, /C004:\s*'agenda'/);
  assert.match(icons, /C005:\s*'inventario'/);
  assert.match(icons, /T014:\s*'cobros'/);
  assert.match(icons, /T020:\s*'reportes'/);
  const app = await read('../assets/app-console.js');
  assert.match(app, /badge\.dataset\.tint\s*=\s*toolTint\(tool\.id\)/);
});

test('PWA empty states stay soft and readable', async () => {
  const css = await read('../assets/pwa-refined.css');
  assert.match(css, /\.empty\{[^}]*border:\s*1px dashed #c9b8f5/);
  assert.match(css, /\.empty\{[^}]*border-radius:\s*20px/);
});

test('official logo stays legible on the navy sidebar', async () => {
  const css = await read('../assets/pwa-refined.css');
  // Brand-book treatment from marca.html: dark-ink wordmark rendered white
  // on dark backgrounds — only when the official logo is in use, so tenant
  // logos keep their own colors.
  assert.match(css, /\.sidebar \.brand img\.logo-official\{filter:brightness\(0\) invert\(1\)\}/);
  const madre = await read('../madre/app.html');
  assert.match(madre, /<img class="logo-official" src="\/assets\/hubie-logo-official\.png"/);
  const app = await read('../assets/app-console.js');
  assert.match(app, /logo\.classList\.toggle\('logo-official',!config\.tenant\.logoUrl\)/);
  assert.match(app, /logo\.classList\.add\('logo-official'\)/);
});

test('landing shares the brand tokens, Nunito and hidden scrollbars', async () => {
  const css = await read('../assets/styles.css');
  assert.match(css, /--purple:\s*#7c5cfc/);
  assert.match(css, /--pink:\s*#ec4899/); // float-card Inventario uses var(--pink)
  assert.match(css, /--ink:\s*#16123a/);
  assert.match(css, /--grad-brand:\s*linear-gradient\(135deg,#7c5cfc 0%,#a855f7 45%,#ec4899 100%\)/);
  assert.match(css, /--font-sans:\s*'Nunito'/);
  assert.match(css, /\*::-webkit-scrollbar\{display:\s*none\}/);
  assert.match(css, /\.ic--lavender\{background:#f3e8ff;color:#9333ea\}/);
  assert.match(css, /\.btn--primary,\.btn--blue\{background:\s*var\(--grad-brand\)/);
  const home = await read('../index.html');
  assert.match(home, /family=Nunito:wght@400;600;700;800;900/);
  assert.doesNotMatch(home, /family=Poppins/);
  const productos = await read('../productos.html');
  assert.match(productos, /ic--purple"><svg[^<]*<use href="#i-people"\/><\/svg><\/span><h4>CRM<\/h4>/);
  assert.match(productos, /ic--lavender"><svg[^<]*<use href="#i-barchart"\/><\/svg><\/span><h4>Reportes<\/h4>/);
});
