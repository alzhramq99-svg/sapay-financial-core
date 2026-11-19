'use strict';
// Bump CACHE_VERSION on every change to this file. Changing the file is what
// makes Safari install the new worker; the version names its cache.
const CACHE_VERSION = 'v8';
const CACHE_NAME = 'sapay-iphone-shell-' + CACHE_VERSION;
const APP_SHELL = ['/', '/index.html', '/styles.css', '/design-tokens.css', '/app.js', '/runtime-config.js', '/manifest.webmanifest',
  '/icons/sapay-192.svg', '/icons/sapay-512.svg', '/icons/sapay-180.png'];
// On a weak connection, wait this long for the network before using the cache.
const NETWORK_TIMEOUT_MS = 5000;
const OFFLINE_MESSAGE = 'يتعذر الاتصال بخادم SApay. تحقق من الإنترنت ثم أعد المحاولة.';

self.addEventListener('install', (event) => {
  // `reload` bypasses the HTTP cache so a new worker never caches stale files.
  event.waitUntil(caches.open(CACHE_NAME)
    .then((cache) => cache.addAll(APP_SHELL.map((path) => new Request(path, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys
      .filter((key) => key !== CACHE_NAME && (key.startsWith('sapay-iphone-shell-') || key === 'sapay-beta-shell-v1'))
      .map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

// Network first, cache as fallback. The previous cache-first strategy kept
// serving the old app.js and styles.css after every deploy while index.html
// came fresh from the network, mixing two versions of the app.
async function networkFirst(request, cacheKey) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)),
    ]);
    if (response.ok) await cache.put(cacheKey, response.clone());
    return response;
  } catch {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    return new Response(OFFLINE_MESSAGE, { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // API calls are never cached: balances and history must always be live.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/index.html'));
  } else if (APP_SHELL.includes(url.pathname)) {
    event.respondWith(networkFirst(request, url.pathname));
  }
});
