'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream');
const root = path.join(__dirname, 'public');
const apiTarget = 'http://127.0.0.1:3000';
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml' };
const server = http.createServer((req, res) => {
  if (req.url === '/api' || req.url.startsWith('/api/')) {
    const target = new URL(req.url, apiTarget);
    const proxyReq = http.request(target, { method:req.method, headers:{...req.headers, host:'127.0.0.1:3000'} }, proxyRes => {
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
server.listen(4173, '0.0.0.0', () => process.stdout.write('SApay web demo listening on 0.0.0.0:4173\n'));
