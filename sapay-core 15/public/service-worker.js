'use strict';
const CACHE_NAME = 'sapay-iphone-shell-v4';
const APP_SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/runtime-config.js', '/manifest.webmanifest', '/icons/sapay-192.svg', '/icons/sapay-512.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('sapay-iphone-shell-') && key !== CACHE_NAME || key === 'sapay-beta-shell-v1').map((key) => caches.delete(key)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach((client) => client.postMessage({ type: 'SAPAY_APP_UPDATED' }));
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(async (response) => {
      if (response.ok) await (await caches.open(CACHE_NAME)).put('/index.html', response.clone());
      return response;
    }).catch(async () => (await caches.match('/index.html')) || new Response(
      'يتعذر الاتصال بخادم SApay. تحقق من الإنترنت ثم أعد المحاولة.',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    )));
    return;
  }
  if (APP_SHELL.includes(url.pathname)) {
    event.respondWith(fetch(request).then(async (response) => {
      if (response.ok) await (await caches.open(CACHE_NAME)).put(request, response.clone());
      return response;
    }).catch(async () => (await caches.match(request)) || Response.error()));
  }
});
