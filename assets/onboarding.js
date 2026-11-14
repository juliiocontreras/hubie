import {icon} from './ui-icons.js';
// Guía de primer uso (018): tarjeta en el inicio de la app + botón Soporte
// en "Mi cuenta" para volver a verla. Textos exactos en español, marca Hubie
// (Nunito, tinta #16123a, morado #7c5cfc, rosa #ec4899), iconos SVG de línea,
// sin emojis como iconografía y sin barras de scroll visibles.
const STEP_ICONS = {profile: 'palette', 'first-client': 'users', catalog: 'grid', quote: 'receipt', team: 'users', billing: 'money'};
const INK = '#16123a', PURPLE = '#7c5cfc', PINK = '#ec4899';
function checkSvg() {
 const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
 svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '16'); svg.setAttribute('height', '16');
 svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2.2');
 svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
 const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
 path.setAttribute('d', 'M4 12.5l5 5L20 6.5'); svg.append(path);
 return svg;
}
function injectStyles() {
 if (document.getElementById('onboarding-styles')) return;
 const style = document.createElement('style');
 style.id = 'onboarding-styles';
 style.textContent = `
#onboarding-guide{font-family:'Nunito',sans-serif;color:${INK};background:#fff;border:1px solid #e8e6f5;border-radius:20px;padding:20px;margin:0 0 20px;box-shadow:0 6px 24px rgba(22,18,58,.06)}
#onboarding-guide *{scrollbar-width:none;-ms-overflow-style:none}
#onboarding-guide *::-webkit-scrollbar{display:none}
.onb-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}
.onb-head h2{font-size:20px;font-weight:800;margin:0;color:${INK}}
.onb-head p{margin:4px 0 0;color:#5b5670;font-size:14px}
.onb-progress{height:8px;border-radius:99px;background:#efedf8;overflow:hidden;margin:14px 0 6px}
.onb-progress>span{display:block;height:100%;border-radius:99px;background:linear-gradient(135deg,${PURPLE},${PINK});transition:width .3s ease}
.onb-count{font-size:13px;color:#5b5670;margin:0 0 12px}
.onb-steps{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.onb-step{display:flex;gap:12px;align-items:flex-start;border:1px solid #efedf8;border-radius:14px;padding:12px}
.onb-step.done{border-color:#d9f2e3;background:#f4fbf6}
.onb-step.done .onb-step-title{color:#14532d}
.onb-step-icon{flex:none;width:36px;height:36px;border-radius:12px;display:grid;place-items:center;background:#f1eefe;color:${PURPLE}}
.onb-step.done .onb-step-icon{background:#d9f2e3;color:#14532d}
.onb-step-body{flex:1;min-width:0}
.onb-step-title{font-weight:800;font-size:15px;margin:0;color:${INK}}
.onb-step-desc{font-size:13px;color:#5b5670;margin:2px 0 8px}
.onb-step-actions{display:flex;gap:8px;flex-wrap:wrap}
.onb-btn{font-family:'Nunito',sans-serif;font-weight:700;font-size:13px;color:${INK};background:#fff;border:1px solid #ddd9f2;border-radius:99px;padding:7px 14px;cursor:pointer}
.onb-btn.primary{background:${PURPLE};border-color:${PURPLE};color:#fff}
.onb-btn.danger{border-color:#f3c2c2;color:#9b1c1c}
.onb-demo{margin-top:14px;padding-top:14px;border-top:1px dashed #e8e6f5;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.onb-demo p{margin:0;font-size:13px;color:#5b5670;flex:1;min-width:200px}
.onb-demo .demo-tag{font-weight:800;color:${PINK}}
.onb-done-note{font-size:13px;color:#14532d;margin:0 0 8px}
`;
 document.head.append(style);
}
export function mountOnboardingGuide({api, write, getConfig, notice, showTool, showBilling, showAppearance}) {
 injectStyles();
 const config = getConfig();
 if (!config?.tenant) return;
 const slug = config.tenant.slug;
 const home = document.getElementById('home');
 if (!home) return;
 let card = document.getElementById('onboarding-guide');
 if (!card) {
  card = document.createElement('section');
  card.id = 'onboarding-guide';
  card.setAttribute('aria-label', 'Guía de primer uso');
  home.prepend(card);
 }
 let supportBtn = document.getElementById('support-nav');
 if (!supportBtn) {
  supportBtn = document.createElement('button');
  supportBtn.id = 'support-nav';
  supportBtn.className = 'nav-item';
  supportBtn.type = 'button';
  supportBtn.textContent = 'Soporte';
  const logout = document.getElementById('logout');
  logout?.parentNode?.insertBefore(supportBtn, logout);
  supportBtn.addEventListener('click', () => {
   render(true);
   card.scrollIntoView({behavior: 'smooth', block: 'start'});
  });
 }
 const activated = new URLSearchParams(location.search).get('onboarding');
 if (activated === 'activated') notice('Tu cuenta está activada. Bienvenido a Hubie.');
 if (activated === 'invalid') notice('Ese enlace de activación ya no es válido. Pide uno nuevo en Hubie Madre.', true);
 const elt = (tag, text, cls) => {const x = document.createElement(tag); if (text !== undefined) x.textContent = text; if (cls) x.className = cls; return x;};
 const enabledTools = new Set((config.tools || []).map(t => t.id));
 async function render(forceOpen = false) {
  let progress;
  try {
   progress = await api('/api/app/' + encodeURIComponent(slug) + '/onboarding');
  } catch (e) {
   card.replaceChildren(elt('p', 'No se pudo cargar la guía de primer uso: ' + e.message, 'help'));
   return;
  }
  card.replaceChildren();
  const head = elt('div', undefined, 'onb-head');
  const headText = elt('div');
  headText.append(elt('h2', 'Primeros pasos en Hubie'), elt('p', 'Completa estos pasos para dejar tu Suite lista para vender.'));
  const count = elt('p', progress.doneCount + ' de ' + progress.total + ' pasos completados', 'onb-count');
  head.append(headText);
  card.append(head);
  const bar = elt('div', undefined, 'onb-progress');
  const fill = elt('span'); fill.style.width = Math.round(progress.doneCount / progress.total * 100) + '%';
  bar.append(fill);
  card.append(bar, count);
  if (progress.complete && !forceOpen) {
   card.append(elt('p', 'Guía completada. Tu Suite está lista para vender.', 'onb-done-note'));
   const replay = elt('button', 'Volver a ver la guía', 'onb-btn');
   replay.type = 'button';
   replay.addEventListener('click', async () => {
    try { await write('/api/app/' + encodeURIComponent(slug) + '/onboarding', 'POST', {action: 'reset'}); await render(true); notice('Guía reiniciada.'); }
    catch (e) { notice('No se pudo reiniciar la guía: ' + e.message, true); }
   });
   card.append(replay);
   appendDemo(card, progress);
   return;
  }
  const list = elt('ol', undefined, 'onb-steps');
  for (const step of progress.steps) {
   const item = elt('li', undefined, 'onb-step' + (step.done ? ' done' : ''));
   const badge = elt('span', undefined, 'onb-step-icon');
   badge.append(step.done ? checkSvg() : icon(STEP_ICONS[step.key] || 'layers', 18));
   const body = elt('div', undefined, 'onb-step-body');
   body.append(elt('p', step.title, 'onb-step-title'), elt('p', step.description + (step.auto ? ' (Ya tienes este dato en tu empresa.)' : ''), 'onb-step-desc'));
   const actions = elt('div', undefined, 'onb-step-actions');
   const cta = {profile: ['Personalizar mi Suite', showAppearance], 'first-client': ['Ir a Clientes', () => showTool('C001')], catalog: ['Ir a Catálogo', () => showTool('C006')], quote: ['Nueva cotización', () => showTool('T013')], team: [null, null], billing: ['Ver mi suscripción', showBilling]}[step.key];
   if (cta[0] && (step.key === 'profile' || step.key === 'billing' || step.key === 'team' || enabledTools.has(step.toolId))) {
    const btn = elt('button', cta[0], 'onb-btn primary');
    btn.type = 'button';
    btn.addEventListener('click', () => cta[1]());
    actions.append(btn);
   }
   if (!step.done) {
    const done = elt('button', 'Marcar como hecho', 'onb-btn');
    done.type = 'button';
    done.addEventListener('click', async () => {
     try { await write('/api/app/' + encodeURIComponent(slug) + '/onboarding', 'POST', {step: step.key}); await render(); }
     catch (e) { notice('No se pudo marcar el paso: ' + e.message, true); }
    });
    actions.append(done);
   }
   body.append(actions);
   item.append(badge, body);
   list.append(item);
  }
  card.append(list);
  appendDemo(card, progress);
 }
 function appendDemo(host, progress) {
  const demo = elt('div', undefined, 'onb-demo');
  const text = elt('p');
  if (progress.demoSeeded) {
   text.innerHTML = '';
   text.append('Tienes ', elt('strong', 'datos de ejemplo', 'demo-tag'), ' cargados: 1 cliente, 1 producto y 1 cotización, marcados como DEMO.');
   const clear = elt('button', 'Eliminar datos de ejemplo', 'onb-btn danger');
   clear.type = 'button';
   clear.addEventListener('click', async () => {
    try { await api('/api/app/' + encodeURIComponent(slug) + '/demo-data', {method: 'DELETE'}); notice('Datos de ejemplo eliminados.'); await render(); }
    catch (e) { notice('No se pudieron eliminar los datos de ejemplo: ' + e.message, true); }
   });
   demo.append(text, clear);
  } else {
   text.textContent = '¿Quieres ver cómo se ve todo lleno? Carga datos de ejemplo y elimínalos cuando quieras, en un clic.';
   const seed = elt('button', 'Cargar datos de ejemplo', 'onb-btn primary');
   seed.type = 'button';
   seed.addEventListener('click', async () => {
    try { await write('/api/app/' + encodeURIComponent(slug) + '/demo-data', 'POST', {}); notice('Datos de ejemplo cargados.'); await render(); }
    catch (e) { notice('No se pudieron cargar los datos de ejemplo: ' + e.message, true); }
   });
   demo.append(text, seed);
  }
  host.append(demo);
 }
 render();
}
