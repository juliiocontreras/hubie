import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root = process.cwd();
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'};
const port = Number(process.env.PORT || 10000);
createServer(async (req,res) => {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  if (pathname === '/healthz') {res.writeHead(200, {'content-type':'application/json'});res.end(JSON.stringify({status:'ok', service:'hubie-dev', database:'not-connected'}));return;}
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405);res.end();return;}
  let decoded;
  try {decoded=decodeURIComponent(pathname);} catch {res.writeHead(400);res.end();return;}
  const file = resolve(root, '.' + (decoded === '/' ? '/index.html' : decoded));
  if (!(file === root || file.startsWith(root + sep)) || decoded.split('/').some(p=>p.startsWith('.'))) {res.writeHead(403);res.end();return;}
  try {
    const s=await stat(file);
    if (!s.isFile()) throw Error('not file');
    const data=await readFile(file);
    res.writeHead(200, {'content-type':types[extname(file).toLowerCase()] || 'application/octet-stream', 'x-content-type-options':'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {res.writeHead(404);res.end('Not found');}
}).listen(port, '0.0.0.0', ()=>console.log('Hubie listening on '+port));
