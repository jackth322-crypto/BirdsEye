/* BirdsEye offline app shell. Photo bytes and upload queue live in IndexedDB. */
const CACHE = 'birdseye-v3-20261113-1';
const CORE = [
  './', './index.html', './manifest.json',
  './avian_ebird_data.json', './avian_na_data.json', './avian_eu_data.json',
  './wordmark-dark.png', './wordmark-light.png',
  './dark_mode_icon-removebg-preview.png', './light_mode_icon-removebg-preview.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
  'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js'
];
const CORE_URLS = new Set(CORE.map(path => new URL(path, self.registration.scope).href));
async function cacheCore() {
  const cache = await caches.open(CACHE);
  // A broken shell must not replace a working offline shell.
  await cache.addAll(CORE.map(url => new Request(new URL(url,self.registration.scope), {cache:'reload'})));
}
self.addEventListener('install', event => {
  event.waitUntil(cacheCore().then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE && /^birdseye-v\d/.test(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  // Never cache Supabase responses, signed URLs, credentials, or account APIs.
  if(req.mode==='navigate' && url.origin===self.location.origin && url.href.startsWith(self.registration.scope)) {
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try {
        const response=await fetch(req);
        if(response.ok)await cache.put(new URL('./index.html',self.registration.scope),response.clone());
        if(response.ok)return response;
      }catch(e){}
      return await cache.match(new URL('./index.html',self.registration.scope)) || new Response('Open BirdsEye once while online to prepare offline access.',{status:503,headers:{'Content-Type':'text/plain'}});
    })());return;
  }
  if(!CORE_URLS.has(url.href))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE),hit=await cache.match(req);
    if(hit)return hit;
    const response=await fetch(req);if(response.ok)await cache.put(req,response.clone());return response;
  })());
});
async function wakeClients() {
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  clients.forEach(client=>client.postMessage({type:'BIRDSEYE_SYNC'}));
}
self.addEventListener('sync', event => {if(event.tag==='birdseye-sync')event.waitUntil(wakeClients());});
self.addEventListener('message', event => {
  if(event.data?.type==='CACHE_CORE')event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    const present=await Promise.all([...CORE_URLS].map(url=>cache.match(url)));
    if(present.some(hit=>!hit))await cacheCore();
  })().catch(error=>{
    event.source?.postMessage({type:'BIRDSEYE_OFFLINE_ERROR',message:error.message});
  }));
});
