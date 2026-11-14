import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Design flow (2026-11-13): CTA "Nueva cotización" en un toque, estados
// vacíos con acción, coherencia visual (sin texto azul, botones con
// gradiente firma, cotizador con marca Hubie). Contratos de contenido:
// si una aserción falla, el flujo volvió a la versión anterior.
const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');

test('cliente: Nueva cotización es el CTA primario en un toque', async () => {
  const app = await read('../assets/app-console.js');
  assert.match(app, /const featured=new Set\(\['C001','C002','C004','C005','T013'\]\)/,
    'Cotizaciones (T013) debe estar en Accesos rápidos del sidebar');
  assert.match(app, /\['T013','Nueva cotización',true,true\]/,
    'Nueva cotización debe ser la primera acción rápida, primaria y directa');
  assert.match(app, /await showTool\(tool\);const first=document\.querySelector\('#op-quote-title'\);if\(first\)\{first\.focus\(\);/,
    'el CTA directo debe abrir el módulo y enfocar el formulario real de alta en un toque');
  const records = await read('../assets/app-records.js');
  assert.match(records, /T013':'＋ Nueva cotización'/);
  assert.match(records, /\$\('add-record'\)\.textContent=newLabelFor\(ctx\.tool\.id\)/,
    'el CTA del encabezado de módulo debe decir qué se crea');
  // El diálogo de alta guarda de verdad: el botón debe ser type=submit,
  // porque save() busca button[type=submit] y sin él el alta fallaba en
  // silencio (TypeError en btn.disabled). Regresión encontrada por QA.
  const appHtml = await read('../app/index.html');
  assert.match(appHtml, /<button type="submit" class="btn btn-primary">Guardar registro<\/button>/);
});

test('estados vacíos: título, qué hacer y botón de acción', async () => {
  const records = await read('../assets/app-records.js');
  assert.match(records, /Aún no hay cotizaciones/);
  assert.match(records, /emptyCopyFor/);
  assert.match(records, /empty-state/);
  assert.match(records, /Sin resultados para tu búsqueda/);
  assert.match(records, /Limpiar búsqueda/);
  assert.match(records, /No se pudo consultar este módulo/);
  assert.match(records, /Reintentar/);
  const admin = await read('../assets/admin-console.js');
  assert.match(admin, /function emptyAction\(title,hint,ctaLabel,onClick\)/);
  assert.match(admin, /Crear primera empresa/);
  assert.match(admin, /Limpiar búsqueda/);
  assert.match(admin, /Aún no hay miembros\. Autoriza el primer correo/);
  const css = await read('../assets/pwa-refined.css');
  assert.match(css, /\.empty-state\{[^}]*justify-items:\s*center/);
  assert.match(css, /\.empty-state strong\{[^}]*font-size:\s*15px/);
});

test('coherencia visual: sin texto azul, botones con gradiente firma', async () => {
  const refined = await read('../assets/pwa-refined.css');
  assert.match(refined, /\.eyebrow\{color:var\(--purple\)\}/,
    'el eyebrow de la PWA no debe ser azul (var(--blue) = #2f6bff)');
  assert.doesNotMatch(refined, /\.eyebrow\{color:var\(--blue\)\}/);
  assert.match(refined, /\.btn-link\{[^}]*color:#5b34f0/,
    'Madre usa .btn-link: debe existir con color morado, no el default del navegador');
  assert.match(refined, /\.btn-lg\{[^}]*min-height:48px/);
  assert.match(refined, /\.btn-primary\{[^}]*background:var\(--grad-brand\)/);
  const nav = await read('../assets/pwa-navigation.css');
  assert.doesNotMatch(nav, /color:#365c84|color:#1e3b5f|color:#1e3b60|color:#243f5c|color:#3b597d/,
    'la navegación no debe tener texto azul oscuro');
  const styles = await read('../assets/styles.css');
  assert.match(styles, /\.tag--blue\{background:#e9f0ff;color:#16123a\}/);
  const compact = await read('../assets/compact.css');
  assert.match(compact, /\.hc-cta\{background:linear-gradient\(135deg,#7c5cfc 0%,#a855f7 45%,#ec4899 100%\)/,
    'el CTA del cotizador debe usar el gradiente firma, no el azul');
  assert.match(compact, /\.hc\{font-family:'Nunito'/);
  assert.match(compact, /\.hc-kicker\{color:#5b34f0\}/);
  const precios = await read('../precios.html');
  assert.doesNotMatch(precios, /#91e7ff/,
    'el kicker del resumen del cotizador no debe ser azul claro');
});

test('Madre: contrato visual de estado de cobro listo para Stripe', async () => {
  const css = await read('../assets/pwa-refined.css');
  assert.match(css, /\.status--current\{background:#d8f6e9;color:#117751\}/);
  assert.match(css, /\.status--past-due\{background:#fef3c7;color:#92400e\}/);
  assert.match(css, /\.status--suspended\{background:#f6e1eb;color:#9e4765\}/);
  // La integración Stripe ya entrega billingStatus desde /api/admin/billing:
  // Madre lo consume (etiqueta del servidor), no lo inventa en la UI.
  const admin = await read('../assets/admin-console.js');
  assert.match(admin, /\/api\/admin\/billing/);
  assert.match(admin, /billingStatus/);
  assert.match(admin, /billingStatusLabel/);
});

test('reglas de Julio intactas en los archivos tocados', async () => {
  for (const p of ['../assets/app-console.js', '../assets/app-records.js',
    '../assets/admin-console.js', '../assets/pwa-refined.css',
    '../assets/pwa-navigation.css', '../assets/styles.css',
    '../assets/compact.css', '../precios.html']) {
    const content = await read(p);
    assert.doesNotMatch(content, /[\u2304\u2228\u25BE\u25B8\u2303]/,
      `${p} reintroduce un carácter de texto como icono (⌄/∨/▾)`);
    assert.doesNotMatch(content, /[\u{1F000}-\u{1FAFF}]/u,
      `${p} usa un emoji como iconografía`);
    // Nota: app-console.js conserva glifos geométricos preexistentes
    // (♧ ◈ ▣ ◇) como marcas de insight; no son emojis pictográficos
    // y no los toca este cambio.
  }
  const refined = await read('../assets/pwa-refined.css');
  assert.match(refined, /\*\{scrollbar-width:\s*none/);
  assert.match(refined, /\*::-webkit-scrollbar\{display:\s*none\}/);
  assert.match(refined, /--grad-brand:\s*linear-gradient\(135deg,#7c5cfc 0%,#a855f7 45%,#ec4899 100%\)/);
});
