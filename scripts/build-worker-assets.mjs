// Copia a worker/public/ SOLO la lista permitida de archivos estáticos
// (espejo de decodedProtected de server.mjs: lo que el servidor Node
// servía, nada más). Herramienta CLI de Node, fuera del Worker.
// Uso: node scripts/build-worker-assets.mjs
// Idempotente: borra worker/public/ y lo reconstruye; al final verifica
// que no haya quedado nada prohibido (platform/, turso/, scripts/,
// tests/, docs/, node_modules, package*.json, *.mjs/*.sql/*.map).
import {cp, mkdir, readdir, rm, stat} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, 'worker', 'public');

// Archivos sueltos de la raíz (páginas públicas + robots/sitemap).
export const ROOT_FILES = [
 'index.html', 'admin.html', 'contacto.html', 'cotizacion.html', 'marca.html',
 'odoo-saltillo.html', 'gestion-recursos-saltillo.html', 'odoo-multitenant.html',
 'ia-para-empresas.html', 'portal.html', 'precios.html', 'productos.html',
 'servicios.html', 'shop.html', 'suite.html', 'tools.html', 'invitacion.html',
 'robots.txt', 'sitemap.xml'
];
// Subdirectorios con su lista cerrada de archivos.
export const SUBDIRS = {
 app: ['index.html', 'manifest.webmanifest', 'sw.js'],
 madre: ['app.html', 'manifest.webmanifest', 'sw.js'],
 auth: ['configuracion.html'],
 encuesta: ['index.html']
};
// assets/ se copia entero (JS/CSS/imágenes/catálogo público).
export const ASSETS_DIR = 'assets';

const FORBIDDEN_NAME = /^(package(-lock)?\.json|\.git)$/i;
const FORBIDDEN_EXT = /\.(mjs|sql|map)$/i;
const FORBIDDEN_DIR = /^(platform|turso|scripts|tests|docs|node_modules|data)$/;

export async function verifyPublicDir(dir, log = () => {}) {
 const bad = [];
 async function walk(d, rel) {
  for (const entry of await readdir(d, {withFileTypes: true})) {
   const p = join(d, entry.name);
   const r = rel ? rel + '/' + entry.name : entry.name;
   if (entry.isDirectory()) {
    if (FORBIDDEN_DIR.test(entry.name)) bad.push(r + ' (directorio prohibido)');
    else await walk(p, r);
   } else if (FORBIDDEN_NAME.test(entry.name) || FORBIDDEN_EXT.test(entry.name)) {
    bad.push(r + ' (archivo prohibido)');
   }
  }
 }
 await walk(dir, '');
 for (const b of bad) log('Prohibido en worker/public: ' + b);
 return bad;
}

export async function buildWorkerAssets({root = ROOT, out = OUT, log = () => {}} = {}) {
 await rm(out, {recursive: true, force: true});
 await mkdir(out, {recursive: true});
 let count = 0;
 for (const file of ROOT_FILES) {
  await cp(join(root, file), join(out, file));
  count++;
  log('copiado ' + file);
 }
 for (const [dir, files] of Object.entries(SUBDIRS)) {
  await mkdir(join(out, dir), {recursive: true});
  for (const file of files) {
   await cp(join(root, dir, file), join(out, dir, file));
   count++;
   log('copiado ' + dir + '/' + file);
  }
 }
 await cp(join(root, ASSETS_DIR), join(out, ASSETS_DIR), {recursive: true});
 const assetFiles = [];
 async function countAssets(d) {
  for (const e of await readdir(d, {withFileTypes: true})) {
   if (e.isDirectory()) await countAssets(join(d, e.name));
   else assetFiles.push(e.name);
  }
 }
 await countAssets(join(out, ASSETS_DIR));
 count += assetFiles.length;
 log(`assets/: ${assetFiles.length} archivos`);
 const bad = await verifyPublicDir(out, log);
 if (bad.length) throw Error('build-worker-assets: archivos prohibidos en worker/public: ' + bad.join(', '));
 // El Worker sirve solo lo copiado aquí; nada de platform/ ni de código.
 const st = await stat(out);
 if (!st.isDirectory()) throw Error('build-worker-assets: no se creó worker/public');
 return {count, out};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
 const {count, out} = await buildWorkerAssets({log: s => console.log(s)});
 console.log(`worker/public listo: ${count} archivos en ${out}`);
}
