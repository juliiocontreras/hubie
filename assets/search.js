// Búsqueda global del tenant (P0). Caja en el shell del cliente con atajo
// "/" o Ctrl+K; resultados agrupados por módulo, con enlace al registro.
// Sin emojis como iconografía, sin texto azul, sin barras visibles.
const elt = (tag, text, cls) => { const x = document.createElement(tag); if (text !== undefined) x.textContent = text; if (cls) x.className = cls; return x; };

export function renderSearchResults(host, data, onNavigate) {
 host.replaceChildren();
 if (!data || !data.groups?.length) {
  host.append(elt('p', data?.query ? 'Sin resultados para "' + data.query + '".' : 'Escribe al menos 2 caracteres para buscar.', 'help'));
  return;
 }
 host.append(elt('p', data.total + (data.total === 1 ? ' resultado' : ' resultados') + ' para "' + data.query + '"', 'help'));
 for (const group of data.groups) {
  host.append(elt('div', group.label + ' · ' + group.items.length, 'search-group-label'));
  for (const item of group.items) {
   const b = elt('button', undefined, 'search-result');
   b.type = 'button';
   b.append(elt('strong', item.title), elt('small', item.detail || ''));
   b.addEventListener('click', () => onNavigate(item));
   host.append(b);
  }
 }
}

// Monta la caja de búsqueda: input + desplegable de resultados.
// api(path) es el fetch del console (real o demo); onNavigate(item) abre el
// registro (showTool en app-console.js). Devuelve {focus, clear}.
export function createGlobalSearch({input, resultsHost, api, onNavigate, debounceMs = 250}) {
 let timer = null, lastQuery = '';
 async function run(query) {
  const q = query.trim();
  if (q.length < 2) { resultsHost.replaceChildren(); resultsHost.hidden = true; return; }
  try {
   const data = await api('/api/app/' + encodeURIComponent(input.dataset.slug) + '/search?q=' + encodeURIComponent(q));
   if (input.value.trim() !== q) return;
   renderSearchResults(resultsHost, data, item => { clear(); onNavigate(item); });
   resultsHost.hidden = false;
  } catch (e) {
   resultsHost.replaceChildren();
   resultsHost.append(elt('p', 'No se pudo buscar: ' + e.message, 'help'));
   resultsHost.hidden = false;
  }
 }
 function clear() { input.value = ''; resultsHost.replaceChildren(); resultsHost.hidden = true; lastQuery = ''; }
 input.addEventListener('input', () => {
  const q = input.value;
  if (q === lastQuery) return;
  lastQuery = q;
  clearTimeout(timer);
  timer = setTimeout(() => void run(q), debounceMs);
 });
 input.addEventListener('keydown', ev => { if (ev.key === 'Escape') { clear(); input.blur(); } });
 input.addEventListener('focus', () => { if (input.value.trim().length >= 2) void run(input.value); });
 document.addEventListener('click', ev => {
  if (!ev.target.closest('.topline-search')) { resultsHost.hidden = true; }
 });
 return {focus: () => input.focus(), clear};
}

// Atajo "/" o Ctrl+K: enfoca la caja salvo que ya se esté escribiendo.
export function bindSearchShortcut(input) {
 document.addEventListener('keydown', ev => {
  const typing = ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement || ev.target instanceof HTMLSelectElement;
  if ((ev.key === '/' && !typing) || ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k')) {
   ev.preventDefault();
   input.focus();
   input.select?.();
  }
 });
}
