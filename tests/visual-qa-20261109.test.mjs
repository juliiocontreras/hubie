import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Visual QA 2026-11-09: three defects found on staging at 360/768/1024/1440px.
test('client brand name gets proper width and never breaks mid-word', async () => {
 const css = await readFile(new URL('../assets/pwa-navigation.css', import.meta.url), 'utf8');
 assert.doesNotMatch(css, /\.sidebar \.brand strong\{max-width:100px;overflow-wrap:anywhere\}/,
  'the old rule squeezed the tenant name into ~50px and broke it mid-word');
 assert.match(css, /\.sidebar \.brand img\{flex:none\}/, 'logo must keep a fixed size');
 assert.match(css, /\.sidebar \.brand strong\{[^}]*flex:1;min-width:0;[^}]*overflow-wrap:normal;[^}]*word-break:normal/,
  'name must flex with min-width:0 and wrap only between words');
 assert.match(css, /#brand-name\{flex-basis:120px\}/,
  'name must drop to its own full-width line when it cannot fit beside the logo');
 assert.match(css, /\.sidebar \.brand strong\{[^}]*-webkit-line-clamp:2/,
  'name must truncate with ellipsis when it still does not fit');
});

test('Madre suite distribution is actually rendered from tenant data', async () => {
 const madre = await readFile(new URL('../madre/app.html', import.meta.url), 'utf8');
 const admin = await readFile(new URL('../assets/admin-console.js', import.meta.url), 'utf8');
 assert.match(madre, /id="madre-suite-distribution"/, 'placeholder must exist');
 assert.match(admin, /renderSuiteDistribution\(\)/, 'renderTenants must fill the distribution');
 assert.match(admin, /\$\('madre-suite-distribution'\)/, 'distribution must target its placeholder');
 assert.match(admin, /Aún no hay empresas registradas en ninguna Suite\./,
  'an empty tenant list must show an empty state, never an eternal spinner');
 assert.doesNotMatch(admin, /import\(['"]\.\.\/platform\/suite-distribution\.mjs['"]\)/,
  '/platform/* is 404 to browsers by design (CI smoke test asserts it), so the browser must count locally');
});

test('tool cards cannot render a broken image, and a bad tenant logo falls back', async () => {
 const app = await readFile(new URL('../assets/app-console.js', import.meta.url), 'utf8');
 const home = app.slice(app.indexOf("const host=$('module-cards')"), app.indexOf('void loadHomeInsights'));
 assert.doesNotMatch(home, /<img|createElement\('img'\)/, 'module cards must not contain any img element');
 assert.match(app, /logo\.onerror=\(\)=>\{logo\.onerror=null;logo\.src='\/assets\/hubie-logo-official\.png';\}/,
  'a tenant logo URL that fails must fall back to the official logo instead of a broken-image icon');
});
