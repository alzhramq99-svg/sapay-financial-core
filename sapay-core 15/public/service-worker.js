'use strict';
const CACHE_NAME = 'sapay-iphone-shell-v2';
const APP_SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/manifest.webmanifest', '/icons/sapay-192.svg', '/icons/sapay-512.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key === 'sapay-beta-shell-v1').map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
      }
      return response;
    }).catch(async () => (await caches.match('/index.html')) || new Response(
      'يتعذر الاتصال بخادم SApay. تحقق من الإنترنت ثم أعد المحاولة.',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    )));
    return;
  }

  if (APP_SHELL.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
  }
});
