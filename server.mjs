import { databaseHealth, executeSql } from './database.mjs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
const root=process.cwd();
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'};
const port=Number(process.env.PORT||10000);
const nav="<nav class=\"hubie-navigation\" aria-label=\"Navegación principal\">\n<a href=\"/index.html\">Inicio</a>\n<details><summary>Suites</summary><div class=\"hubie-submenu\"><a href=\"/suite.html\">Explorar Suites</a><a href=\"/suite.html#office\">Office</a><a href=\"/suite.html#industrial\">Industrial</a><a href=\"/suite.html#commerce\">Commerce</a><a href=\"/suite.html#realty\">Realty</a><a href=\"/suite.html#services\">Services</a><a href=\"/suite.html#health\">Health</a></div></details>\n<details><summary>Herramientas</summary><div class=\"hubie-submenu\"><a href=\"/suite.html#tools\">Catálogo de Tools</a><a href=\"/suite.html#crm\">CRM y clientes</a><a href=\"/suite.html#inventario\">Inventario</a><a href=\"/suite.html#agenda\">Agenda</a></div></details>\n<details><summary>Soluciones</summary><div class=\"hubie-submenu\"><a href=\"/servicios.html\">Servicios profesionales</a><a href=\"/shop.html\">Hubie Shop</a><a href=\"/servicios.html#marketing\">Marketing y diseño</a></div></details>\n<a href=\"/precios.html\">Cotizador</a><a href=\"/contacto.html\">Contacto</a>\n</nav>";
const navStyles='<link rel="stylesheet" href="/assets/navigation.css">';
function enhanceHtml(html){
  // Replace the old flat navigation consistently across all existing pages.
  const updated=html.replace(/<nav class="nav__menu">[\s\S]*?<\/nav>/,nav);
  return updated.replace('</head>',navStyles+'</head>');
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
