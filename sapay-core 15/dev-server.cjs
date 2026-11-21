'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream');
const root = path.join(__dirname, 'public');
// Overridable so tests (and a second local checkout) can use other ports.
const apiTarget = process.env.SAPAY_API_TARGET || 'http://127.0.0.1:3000';
const port = Number(process.env.SAPAY_DEV_PORT || 4173);
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml' };
const server = http.createServer((req, res) => {
  if (req.url === '/api' || req.url.startsWith('/api/')) {
    const target = new URL(req.url, apiTarget);
    // The browser treats this server as the page's own origin, so the request
    // is same-origin from its point of view. Drop Origin before proxying: the
    // API's CORS allowlist covers deployed origins only and would reject the
    // loopback origin of this local proxy.
    const { origin: _origin, ...forwardHeaders } = req.headers;
    const proxyReq = http.request(target, { method:req.method, headers:{...forwardHeaders, host:new URL(apiTarget).host} }, proxyRes => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      pipeline(proxyRes, res, () => {});
    });
    proxyReq.on('error', () => { if (!res.headersSent) { res.writeHead(502, {'content-type':'application/json'}); res.end(JSON.stringify({message:'API غير متاحة حاليًا'})); } });
    req.pipe(proxyReq);
    return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); res.end('Bad request'); return; }
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(root, requested);
  if (!file.startsWith(root + path.sep) && file !== path.join(root, 'index.html')) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404, {'content-type':'text/plain; charset=utf-8'}); res.end('Not found'); return; }
    res.writeHead(200, {
      'content-type':types[path.extname(file)] || 'application/octet-stream',
      'cache-control':'no-store',
      'x-content-type-options':'nosniff',
      'referrer-policy':'no-referrer',
      'x-frame-options':'DENY',
      'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
      'permissions-policy':'camera=(), microphone=(), geolocation=()'
    });
    res.end(data);
  });
});
server.listen(port, '0.0.0.0', () => process.stdout.write(`SApay web demo listening on 0.0.0.0:${server.address().port}\n`));
