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
createServer(async(req,res)=>{
  const pathname=new URL(req.url||'/','http://localhost').pathname;
  if(pathname==='/healthz'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({status:'ok',service:'hubie-dev',database:'not-connected'}));return;}
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
