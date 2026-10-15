const V='168a364ade',C='recall-'+V,ASSETS=['./','index.html','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/icon.svg'];
const ICON=new URL('icons/icon-192.png',self.registration.scope).href;
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n!==C&&n!=='recall-state').map(n=>caches.delete(n)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);
 if(r.method!=='GET'||u.origin!==location.origin)return;
 e.respondWith(fetch(r,{cache:'no-cache'}).then(res=>{if(res.ok){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp))}return res}).catch(()=>caches.match(r).then(m=>m||caches.match('index.html'))))});
async function check(){
 const c=await caches.open('recall-state'),k=new URL('state.json',self.registration.scope).href,r=await c.match(k);if(!r)return;
 const s=await r.json();if(!s.rn)return;
 const t=Date.now(),ds=new Date(t).setHours(0,0,0,0),p=(s.rt||'20:00').split(':'),at=new Date(t).setHours(+p[0],+p[1],0,0);
 if(t<at||s.ln===ds)return;
 const n=(s.dues||[]).filter(x=>x<=t).length;if(!n)return;
 await self.registration.showNotification('Recall',{body:n+' questions are due. Time to recall.',tag:'recall-daily',icon:ICON,badge:ICON});
 s.ln=ds;await c.put(k,new Response(JSON.stringify(s)))}
self.addEventListener('periodicsync',e=>{if(e.tag==='recall-daily')e.waitUntil(check())});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>l.length?l[0].focus():self.clients.openWindow(self.registration.scope)))});

