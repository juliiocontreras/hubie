const CACHE='hubie-client-pwa-documents-v2';
const FILES=['/app/index.html','/assets/pwa-console.css','/assets/pwa-refined.css','/assets/pwa-navigation.css',
 '/assets/appearance-ui.js','/assets/media-ui.js','/assets/ui-icons.js','/assets/app-console.js',
 '/assets/demo-backend.js','/assets/catalog.json','/assets/app-records.js','/assets/attachments-ui.js',
 '/assets/tool-forms.js','/assets/app-workflows.js','/assets/operational-clients.js','/assets/operational-crm.js',
 '/assets/operational-agenda.js','/assets/operational-cases.js','/assets/operational-stock.js','/assets/favicon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('hubie-client-')&&k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{
 const url=new URL(e.request.url);
 if(e.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(e.request.mode==='navigate'){
  e.respondWith(fetch(e.request,{cache:'no-store'}).catch(()=>caches.match('/app/index.html')));return;
 }
 if(FILES.includes(url.pathname))
  e.respondWith(fetch(e.request,{cache:'no-store'}).then(async response=>{
   if(response.ok){const cache=await caches.open(CACHE);await cache.put(url.pathname,response.clone());}
   return response;
  }).catch(()=>caches.match(url.pathname)));
});
