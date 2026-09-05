const CACHE='sidecar-shell-v2';
const ASSETS=['./','./app.js','./markdown.js','./style.css','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('sidecar-shell-')&&key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==location.origin||url.pathname.includes('/api/')||url.pathname.includes('/relay/'))return;event.respondWith(fetch(event.request).catch(()=>caches.match(event.request).then(result=>result??(event.request.mode==='navigate'?caches.match('./'):Response.error()))));});
