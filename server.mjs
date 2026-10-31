import { databaseHealth, executeSql } from './database.mjs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
const root=process.cwd();
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'};
const port=Number(process.env.PORT||10000);
const nav=`<button class="hubie-menu-toggle" type="button" aria-expanded="false" aria-controls="hubie-main-nav" aria-label="Abrir menú">☰ <span>Menú</span></button>
<nav id="hubie-main-nav" class="hubie-navigation" aria-label="Navegación principal">
<a href="/index.html">Inicio</a>
<details><summary>Suites</summary><div class="hubie-submenu"><a href="/suite.html">Explorar Suites</a><a href="/suite.html">Office · Industrial · Commerce · Realty · Services · Health</a></div></details>
<details><summary>Tools</summary><div class="hubie-submenu"><a href="/tools.html">Explorar herramientas</a><a href="/tools.html#crm">CRM y clientes</a><a href="/tools.html#inventario">Inventario</a><a href="/tools.html#agenda">Agenda</a></div></details>
<details><summary>Soluciones</summary><div class="hubie-submenu"><a href="/servicios.html">Servicios profesionales</a><a href="/shop.html">Hubie Shop</a></div></details>
<a href="/precios.html">Cotizador</a><a href="/contacto.html">Contacto</a>
</nav>`;
const navStyles='<link rel="stylesheet" href="/assets/navigation.css">';
const navScript=`<script>(function(){const button=document.querySelector('.hubie-menu-toggle'),nav=document.getElementById('hubie-main-nav');if(!button||!nav)return;button.addEventListener('click',()=>{const open=nav.classList.toggle('is-open');button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'Cerrar menú':'Abrir menú');});nav.querySelectorAll('details').forEach(d=>d.addEventListener('toggle',()=>{if(d.open)nav.querySelectorAll('details').forEach(other=>{if(other!==d)other.open=false;});}));})();</script>`;
const sharedHeader="<header class=\"site-header\"><div class=\"container nav\"><a href=\"/index.html\" class=\"logo\" aria-label=\"Hubie, inicio\"><svg class=\"logo__mark\" viewBox=\"0 0 32 32\" aria-hidden=\"true\"><path d=\"M10 7 L24 16 L10 25\" fill=\"none\" stroke=\"url(#lg)\" stroke-width=\"9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg><span class=\"logo__type logo__i\">Hubie</span></a><button class=\"hubie-menu-toggle\" type=\"button\" aria-expanded=\"false\" aria-controls=\"hubie-main-nav\" aria-label=\"Abrir menú\">☰ <span>Menú</span></button>\n<nav id=\"hubie-main-nav\" class=\"hubie-navigation\" aria-label=\"Navegación principal\">\n<a href=\"/index.html\">Inicio</a>\n<details><summary>Suites</summary><div class=\"hubie-submenu\"><a href=\"/suite.html\">Explorar Suites</a><a href=\"/suite.html\">Office · Industrial · Commerce · Realty · Services · Health</a></div></details>\n<details><summary>Tools</summary><div class=\"hubie-submenu\"><a href=\"/tools.html\">Explorar herramientas</a><a href=\"/tools.html#crm\">CRM y clientes</a><a href=\"/tools.html#inventario\">Inventario</a><a href=\"/tools.html#agenda\">Agenda</a></div></details>\n<details><summary>Soluciones</summary><div class=\"hubie-submenu\"><a href=\"/servicios.html\">Servicios profesionales</a><a href=\"/shop.html\">Hubie Shop</a></div></details>\n<a href=\"/precios.html\">Cotizador</a><a href=\"/contacto.html\">Contacto</a>\n</nav><a href=\"/contacto.html\" class=\"btn btn--primary btn--sm hubie-header-cta\">Solicitar información</a></div></header>";
const sharedFooter="<footer class=\"hubie-site-footer\"><div class=\"container hubie-footer-inner\"><a class=\"hubie-footer-brand\" href=\"/index.html\">Hubie</a><nav aria-label=\"Enlaces del pie de página\"><a href=\"/suite.html\">Suites</a><a href=\"/tools.html\">Tools</a><a href=\"/servicios.html\">Servicios</a><a href=\"/shop.html\">Shop</a><a href=\"/precios.html\">Cotizador</a><a href=\"/contacto.html\">Contacto</a></nav><small>© 2026 Hubie · Todos los derechos reservados.</small></div></footer>";
function enhanceHtml(html){
 let updated=html.replace(/<header\b[^>]*>[\s\S]*?<\/header>/i,sharedHeader);
 updated=updated.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/i,sharedFooter);
 if(!/<footer\b/i.test(updated))updated=updated.replace('</body>',sharedFooter+'</body>');
 updated=updated.replace(/href=["'](?:\.\/)?productos\.html(["'])/g,'href="/shop.html"');
 updated=updated.replace(/https:\/\/fonts.googleapis.com\/css2\?family=Nunito:[^"']+/g,'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');
 if(!updated.includes('fonts.googleapis.com/css2?family=Poppins'))updated=updated.replace('</head>','<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet"></head>');
 updated=updated.replace('</head>',navStyles+'</head>');
 return updated.replace('</body>',navScript+'</body>');
}
function decodedProtected(path){return /^(?:\/\.git|\/turso\/|\/scripts\/|\/tests\/|\/docs\/|\/database\.mjs$|\/server\.mjs$|\/package(?:-lock)?\.json$)/i.test(path);}
async function applyCoreSchema(){
 const health=await databaseHealth();
 if(health.status!=='connected'){console.error('Core migration skipped: database '+health.status+' '+(health.reason||''));return;}
 const sql=await readFile(resolve(root,'turso/migrations/001_core.sql'),'utf8');
 for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await executeSql(statement);
 const result=await executeSql("SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name IN ('organizations','users','memberships','organization_invitations','audit_events')");
 const count=Number(result?.rows?.[0]?.[0]?.value??0);
 if(count!==5)throw new Error('Core schema verification failed');
 console.log('Hubie core schema verified: 5 tables');
}
createServer(async(req,res)=>{
  const pathname=new URL(req.url||'/','http://localhost').pathname;
  if(pathname==='/healthz'){const db=await databaseHealth();res.writeHead(db.status==='unavailable'?503:200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({status:db.status==='unavailable'?'degraded':'ok',service:'hubie-dev',database:db.status,...(db.reason?{reason:db.reason}:{})}));return;}
  if(decodedProtected(pathname)){res.writeHead(404);res.end('Not found');return;}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  let decoded;try{decoded=decodeURIComponent(pathname);}catch{res.writeHead(400);res.end();return;}
  const file=resolve(root,'.'+(decoded==='/'?'/index.html':decoded));
  if(!(file===root||file.startsWith(root+sep))||decoded.split('/').some(p=>p.startsWith('.'))){res.writeHead(403);res.end();return;}
  try{
    const s=await stat(file);if(!s.isFile())throw Error('not file');
    const isHtml=extname(file).toLowerCase()==='.html';
    const raw=await readFile(file);
    const data=isHtml?Buffer.from(enhanceHtml(raw.toString('utf8'))):raw;
    res.writeHead(200,{'content-type':types[extname(file).toLowerCase()]||'application/octet-stream','x-content-type-options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'0.0.0.0',()=>console.log('Hubie listening on '+port));
applyCoreSchema().catch(error=>console.error('Core migration failed:',error?.code||error?.name||'unknown'));
