/* Le Plateau : fonctionnement hors connexion */
const CACHE='plateau-v1';
const BASE=['./','index.html','app.js','style.css','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(BASE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  const reseauDabord=url.pathname.endsWith('jeux.json')||url.pathname.endsWith('app.js')||url.pathname.endsWith('.html')||url.pathname.endsWith('/');
  if(reseauDabord){
    e.respondWith(fetch(req).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(req.url.split('?')[0],c));return r}).catch(()=>caches.match(req.url.split('?')[0]).then(r=>r||caches.match('index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then(r=>r||fetch(req).then(n=>{if(n.ok||n.type==='opaque'){const c=n.clone();caches.open(CACHE).then(x=>x.put(req,c))}return n})));
});
